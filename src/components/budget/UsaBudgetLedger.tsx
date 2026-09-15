import styled from 'styled-components'
import { Badge, Typography } from 'myk-library'
import {
  USA_BUDGET_FRAME,
  USA_COUPLE_SETTLEMENTS,
  USA_ESTIMATE_LINES,
  USA_PAYMENT_RULES,
  USA_SETTLEMENT_HONESTY,
  USA_SUPPLIER_LINES,
  formatUsd,
  type UsaBudgetLine,
  type UsaCoupleSettlement,
  type UsaMoney,
} from '@/data/usaBudget'
import { AlertTriangle, BookOpen, Handshake, Landmark, Receipt } from 'lucide-react'

function Money({ money }: { money: UsaMoney }) {
  if (money.kind === 'tbd') {
    return (
      <Tbd>
        <Badge size="sm">TBD</Badge>
        <span>{money.hint}</span>
      </Tbd>
    )
  }
  return <Amount>{formatUsd(money.amount)}</Amount>
}

function LineCard({ line }: { line: UsaBudgetLine }) {
  return (
    <Line>
      <LineTop>
        <LineTitle>{line.label}</LineTitle>
        <Money money={line.money} />
      </LineTop>
      <Meta>
        {line.remainingDue && <Badge size="sm">יתרה לספק</Badge>}
        {line.paidToSupplier && <Badge size="sm">שולם לספק</Badge>}
        {line.dueDate && <span>עד {line.dueDate}</span>}
      </Meta>
      <Payer>{line.payerLabel}</Payer>
      <Notes>{line.notes}</Notes>
      <Source>מקור: {line.source}</Source>
    </Line>
  )
}

function CoupleCard({ couple }: { couple: UsaCoupleSettlement }) {
  return (
    <Couple>
      <CoupleHead>
        <LineTitle>{couple.label}</LineTitle>
        <Badge size="sm">טרם ידוע</Badge>
      </CoupleHead>
      <Payer>ילדים שאבנר מכסה: {couple.kidsAvnerCovers}</Payer>
      <Sub>להחזיר לאבנר (נוסחה, בלי סכום)</Sub>
      {couple.oweAvner.map(line => (
        <Owe key={line.id}>
          <LineTop>
            <LineTitle as="div">{line.label}</LineTitle>
            <Money money={line.money} />
          </LineTop>
          <Notes>{line.formula}</Notes>
        </Owe>
      ))}
      <Sub>משלמים לספק — לא לאבנר</Sub>
      <List>
        {couple.paySupplierNotAvner.map(note => (
          <li key={note}>{note}</li>
        ))}
      </List>
    </Couple>
  )
}

export default function UsaBudgetLedger() {
  const remaining = USA_SUPPLIER_LINES.filter(l => l.remainingDue)
  const paid = USA_SUPPLIER_LINES.filter(l => l.paidToSupplier)
  const knownFare = USA_SUPPLIER_LINES.filter(
    l => l.money.kind === 'usd' && !l.remainingDue && !l.paidToSupplier,
  )
  const open = USA_SUPPLIER_LINES.filter(l => l.money.kind === 'tbd')

  return (
    <Wrap>
      <Section>
        <Head>
          <Receipt size={16} />
          <Typography variant="h6" style={{ margin: 0 }}>1. כמה עלה עד עכשיו</Typography>
        </Head>
        <Hint>
          רק סכומים עם קבלה שכבר יצאו מחשבון. טיסות אל על ויתרות הקרוז <strong>לא</strong> כאן — אין אישור תשלום מתוארך.
        </Hint>
        {paid.map(line => <LineCard key={line.id} line={line} />)}
      </Section>

      <Section>
        <Head>
          <Handshake size={16} />
          <Typography variant="h6" style={{ margin: 0 }}>2. מה צריך לשלם לאבנר פר זוג</Typography>
        </Head>
        <Hint>
          אבנר מכסה: טיסות ילדים, חלק הילדים בקרוז, פארקים לכולם, וילה + אוכל בית, רכב/ים לקבוצה, הוא ורחל.
          הזוגות מחזירים חלק מבוגרים בפארקים/וילה/רכב — בלי מחיר יחידה אין סכום, לא ממציאים.
        </Hint>
        <Empty>
          <AlertTriangle size={16} />
          <div>
            <strong>{USA_SETTLEMENT_HONESTY.title}</strong>
            <Notes>{USA_SETTLEMENT_HONESTY.body}</Notes>
            <Source>מקור: {USA_SETTLEMENT_HONESTY.source}</Source>
          </div>
        </Empty>
        {USA_COUPLE_SETTLEMENTS.map(couple => (
          <CoupleCard key={couple.id} couple={couple} />
        ))}
      </Section>

      <Section>
        <Head>
          <Landmark size={16} />
          <Typography variant="h6" style={{ margin: 0 }}>3. כמה נשאר לשלם (צפוי)</Typography>
        </Head>
        <Hint>
          יתרות RC הן מספרים ידועים לספק. טיסות, פארקים, וילה, ESTA וביטוח מסומנים כאומדן או TBD — לא נסכמים למעטפת טיול.
        </Hint>
        <Sub>יתרות ידועות לרויאל קריביאן</Sub>
        {remaining.map(line => <LineCard key={line.id} line={line} />)}
        <Sub>טיסות מבוגרים — עלות ידועה, תשלום לא אושר</Sub>
        {knownFare.map(line => <LineCard key={line.id} line={line} />)}
        <Sub>אומדן פארקים (רמי) — לא נקנה</Sub>
        {USA_ESTIMATE_LINES.map(line => <LineCard key={line.id} line={line} />)}
        <Sub>עדיין לא הוזמן / סכום לא ידוע</Sub>
        {open.map(line => <LineCard key={line.id} line={line} />)}
        <Footnote>
          רמי ציין פעם מעטפת לכל הטיול ~{formatUsd(USA_BUDGET_FRAME.withoutCruiseUsd)} בלי קרוז / ~{formatUsd(USA_BUDGET_FRAME.withCruiseUsd)} עם Utopia.
          זה אומדן ישן, לא «תקציב שיש» ולא הסכום שמוצג למעלה. {USA_BUDGET_FRAME.source}.
        </Footnote>
      </Section>

      <Section>
        <Head>
          <BookOpen size={16} />
          <Typography variant="h6" style={{ margin: 0 }}>כללי תשלום</Typography>
        </Head>
        <Hint>
          מי משלם מה — לא סכומים. חלק הילדים בקרוז הוא החלטת בן, גם אם טבלת המסמך עדיין כותבת אחרת.
        </Hint>
        {USA_PAYMENT_RULES.map(rule => (
          <Rule key={rule.id}>
            <RuleTitle>{rule.title}</RuleTitle>
            <Notes>{rule.body}</Notes>
            <Payer>משלם: {rule.payer}</Payer>
            <Source>מקור: {rule.source}</Source>
          </Rule>
        ))}
      </Section>
    </Wrap>
  )
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 12px;
`

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.gray[600]};
`

const Sub = styled.h3`
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray[700]};
`

const Rule = styled.div`
  padding: 10px 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray[100]};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
`

const RuleTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray[900]};
  margin-bottom: 4px;
`

const Line = styled.div`
  padding: 10px 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray[100]};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
`

const Couple = styled(Line)`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const CoupleHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

const Owe = styled.div`
  padding: 8px 10px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
`

const List = styled.ul`
  margin: 0;
  padding: 0 1.2em 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.gray[700]};
`

const LineTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`

const LineTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const Amount = styled.div`
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.gray[900]};
  white-space: nowrap;
`

const Tbd = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.gray[600]};
  text-align: left;
`

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.gray[600]};
`

const Payer = styled.div`
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary[700]};
`

const Notes = styled.p`
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.gray[700]};
`

const Source = styled.div`
  margin-top: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.gray[500]};
`

const Empty = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(214, 122, 31, 0.12);
  color: #b5630f;
`

const Footnote = styled.p`
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.gray[500]};
`
