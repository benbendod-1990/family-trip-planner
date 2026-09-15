import styled from 'styled-components'
import { Badge, Typography } from 'myk-library'
import {
  USA_ESTIMATE_LINES,
  USA_PAYMENT_RULES,
  USA_SETTLEMENT_HONESTY,
  USA_SETTLEMENT_LINES,
  USA_SUPPLIER_LINES,
  formatUsd,
  type UsaBudgetLine,
  type UsaMoney,
} from '@/data/usaBudget'
import { AlertTriangle, BookOpen, Calculator, Handshake, Landmark } from 'lucide-react'

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

      <Section>
        <Head>
          <Landmark size={16} />
          <Typography variant="h6" style={{ margin: 0 }}>יתרות לספקים</Typography>
        </Head>
        <Hint>
          יתרה = מה שנשאר לשלם לספק (אל על / רויאל קריביאן). זה לא חוב בין בני משפחה.
        </Hint>
        <Sub>נותר לשלם</Sub>
        {remaining.map(line => <LineCard key={line.id} line={line} />)}
        <Sub>שולם לספק (ידוע מקבלה)</Sub>
        {paid.map(line => <LineCard key={line.id} line={line} />)}
        {knownFare.length > 0 && (
          <>
            <Sub>עלות ידועה — תשלום לספק לא אושר עם תאריך</Sub>
            {knownFare.map(line => <LineCard key={line.id} line={line} />)}
          </>
        )}
        <Sub>עדיין לא הוזמן / סכום לא ידוע</Sub>
        {open.map(line => <LineCard key={line.id} line={line} />)}
      </Section>

      <Section>
        <Head>
          <Calculator size={16} />
          <Typography variant="h6" style={{ margin: 0 }}>אומדנים</Typography>
        </Head>
        <Hint>מספרי רמי ושיחות WhatsApp — לתכנון בלבד, לא תשלום שבוצע ולא יתרת ספק.</Hint>
        {USA_ESTIMATE_LINES.map(line => <LineCard key={line.id} line={line} />)}
      </Section>

      <Section>
        <Head>
          <Handshake size={16} />
          <Typography variant="h6" style={{ margin: 0 }}>התחשבנות בין בני המשפחה</Typography>
        </Head>
        {USA_SETTLEMENT_LINES.length === 0 ? (
          <Empty>
            <AlertTriangle size={16} />
            <div>
              <strong>{USA_SETTLEMENT_HONESTY.title}</strong>
              <Notes>{USA_SETTLEMENT_HONESTY.body}</Notes>
              <Source>מקור: {USA_SETTLEMENT_HONESTY.source}</Source>
            </div>
          </Empty>
        ) : (
          USA_SETTLEMENT_LINES.map(line => <LineCard key={line.id} line={line} />)
        )}
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
