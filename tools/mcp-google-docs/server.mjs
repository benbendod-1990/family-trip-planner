#!/usr/bin/env node
// MCP server exposing Google Docs *write* access.
//
// Why this exists: the claude.ai Google Drive connector is read-only — it has
// read_file_content / create_file but no update tool, and there is no Google
// Docs connector at all. Since this project's hard invariant is that the trip
// Doc and the app never diverge, and the Doc is the source of truth, we need a
// way to write back to it.
//
// Zero dependencies on purpose: the MCP wire format is just newline-delimited
// JSON-RPC 2.0 over stdio, so pulling in an SDK would add supply-chain surface
// for ~80 lines of framing.
//
// IMPORTANT: stdout is the protocol channel. Never console.log here — all
// diagnostics go to stderr.

import { createInterface } from 'node:readline'
import { getDocument, batchUpdate, extractBlocks, SetupError } from './google.mjs'

const PROTOCOL_VERSION = '2024-11-05'

const TOOLS = [
  {
    name: 'docs_read',
    description:
      'Read a Google Doc. format="blocks" (default) returns every text block with its ' +
      'character range and location, including inside table cells — use this to find exact ' +
      'strings before replacing. format="text" returns plain text. format="raw" returns the ' +
      'full Docs API JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Doc ID from the /document/d/<ID>/edit URL.' },
        format: { type: 'string', enum: ['blocks', 'text', 'raw'], default: 'blocks' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'docs_replace_text',
    description:
      'Replace exact text strings throughout a Google Doc, including inside tables. ' +
      'Applies all replacements in one atomic batch. Returns how many occurrences each ' +
      'replacement changed — a count of 0 means the search string did not match, so always ' +
      'check the counts rather than assuming success. Note: inserted text takes the ' +
      'formatting of the start of the replaced range; it does not carry bold/bullets.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string' },
        replacements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string' },
              replace: { type: 'string' },
              matchCase: { type: 'boolean', default: true },
            },
            required: ['find', 'replace'],
          },
        },
      },
      required: ['documentId', 'replacements'],
    },
  },
  {
    name: 'docs_batch_update',
    description:
      'Escape hatch: send raw Google Docs API batchUpdate requests (insertText, ' +
      'deleteContentRange, updateTextStyle, insertTableRow, etc). Use when replace_text ' +
      'cannot express the edit — e.g. restoring bold or bullets. Index-based requests are ' +
      'fragile: indices shift as earlier edits apply, so order requests back-to-front.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string' },
        requests: { type: 'array', items: { type: 'object' } },
      },
      required: ['documentId', 'requests'],
    },
  },
]

async function callTool(name, args) {
  switch (name) {
    case 'docs_read': {
      const doc = await getDocument(args.documentId)
      const format = args.format ?? 'blocks'
      if (format === 'raw') return JSON.stringify(doc, null, 2)
      const blocks = extractBlocks(doc)
      if (format === 'text') return blocks.map((b) => b.text).join('\n')
      return JSON.stringify({ title: doc.title, revisionId: doc.revisionId, blocks }, null, 2)
    }

    case 'docs_replace_text': {
      const list = args.replacements ?? []
      if (!list.length) throw new Error('replacements must not be empty')
      const requests = list.map((r) => ({
        replaceAllText: {
          containsText: { text: r.find, matchCase: r.matchCase !== false },
          replaceText: r.replace,
        },
      }))
      const res = await batchUpdate(args.documentId, requests)
      const report = list.map((r, i) => ({
        find: r.find.length > 60 ? `${r.find.slice(0, 60)}…` : r.find,
        occurrencesChanged: res.replies?.[i]?.replaceAllText?.occurrencesChanged ?? 0,
      }))
      const missed = report.filter((r) => r.occurrencesChanged === 0)
      return JSON.stringify(
        {
          documentId: args.documentId,
          applied: report,
          ...(missed.length ? { warning: `${missed.length} replacement(s) matched nothing` } : {}),
        },
        null,
        2,
      )
    }

    case 'docs_batch_update': {
      const res = await batchUpdate(args.documentId, args.requests ?? [])
      return JSON.stringify(res, null, 2)
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ---------------------------------------------------------------- JSON-RPC

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`)
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })

async function handle(msg) {
  const { id, method, params } = msg

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'google-docs', version: '1.0.0' },
      })

    case 'tools/list':
      return reply(id, { tools: TOOLS })

    case 'tools/call': {
      try {
        const text = await callTool(params?.name, params?.arguments ?? {})
        return reply(id, { content: [{ type: 'text', text }] })
      } catch (err) {
        // Tool-level failures come back as content with isError so the model can
        // read and act on the message instead of just seeing a transport error.
        const hint = err instanceof SetupError ? err.message : `Error: ${err.message}`
        return reply(id, { content: [{ type: 'text', text: hint }], isError: true })
      }
    }

    case 'ping':
      return reply(id, {})

    default:
      // Notifications have no id and must not be answered.
      if (id === undefined || id === null) return
      return send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      })
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let msg
  try {
    msg = JSON.parse(trimmed)
  } catch {
    process.stderr.write(`[google-docs] dropped non-JSON line\n`)
    return
  }
  handle(msg).catch((err) => {
    process.stderr.write(`[google-docs] handler crashed: ${err.stack}\n`)
    if (msg.id !== undefined && msg.id !== null) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(err.message) } })
    }
  })
})
rl.on('close', () => process.exit(0))
