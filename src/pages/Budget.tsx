import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Stack, Grid, StatCard, Progress, Button, Badge, ActionIcon,
  Alert, Typography, NumberInput, Select, Box,
} from 'myk-library'
import { DataTable } from 'myk-library'
import type { ColumnDef } from 'myk-library'
import { useTripStore, getTotalSpent, getBudgetByCategory } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { formatCurrency, CURRENCY_OPTIONS } from '@/utils/currency'
import ExpenseFormModal from '@/components/budget/ExpenseFormModal'
import UsaBudgetLedger from '@/components/budget/UsaBudgetLedger'
import type { BudgetItem } from '@/types/budget'
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react'
import styled from 'styled-components'
import {
  USA_BUDGET_FRAME,
  USA_BUDGET_SEED_ITEM_IDS,
  USA_TRIP_ID,
  formatUsd,
  usaPaidToSupplierUsd,
  usaSupplierRemainingUsd,
} from '@/data/usaBudget'

const CATEGORY_LABEL: Record<string, string> = {
  flights: '✈️ טיסות',
  accommodation: '🏨 לינה',
  food: '🍽️ אוכל',
  activities: '🎯 פעילויות',
  transport: '🚌 תחבורה',
  shopping: '🛍️ קניות',
  other: '💰 אחר',
}

const PageWrapper = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '12px' : '24px')};
  display: flex;
  flex-direction: column;
  gap: 24px;
`

export default function Budget() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const removeExpense = useTripStore(s => s.removeExpense)
  const setBudget = useTripStore(s => s.setBudget)

  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<BudgetItem | undefined>()
  const [editBudget, setEditBudget] = useState(false)
  const [newTotal, setNewTotal] = useState(0)
  const [newCurrency, setNewCurrency] = useState('ILS')

  const { isMobile, isTablet } = useBreakpoint()

  if (!trip) return null

  const isUsa = trip.id === USA_TRIP_ID
  const totalSpent = getTotalSpent(trip)
  const totalBudget = trip.budget.totalBudget
  const currency = trip.budget.currency
  const remaining = totalBudget - totalSpent
  const overBudget = totalSpent > totalBudget && totalBudget > 0
  const byCategory = getBudgetByCategory(trip)
  const userItems = isUsa
    ? trip.budget.items.filter(i => !USA_BUDGET_SEED_ITEM_IDS.has(i.id))
    : trip.budget.items

  const columns: ColumnDef<BudgetItem>[] = [
    { key: 'category', header: 'קטגוריה', cell: r => <Badge size="sm">{CATEGORY_LABEL[r.category]}</Badge> },
    { key: 'label', header: 'תיאור', accessor: 'label' },
    { key: 'planned', header: 'מתוכנן', cell: r => formatCurrency(r.planned, currency) },
    { key: 'actual', header: 'בפועל', cell: r => r.actual !== undefined ? formatCurrency(r.actual, currency) : '—' },
    {
      key: 'actions', header: '', cell: r => (
        <Stack direction="row" spacing="xs">
          <ActionIcon size="sm" variant="subtle" onClick={() => setEditItem(r)}><Pencil size={12} /></ActionIcon>
          <ActionIcon size="sm" variant="subtle" onClick={() => removeExpense(trip.id, r.id)}><Trash2 size={12} /></ActionIcon>
        </Stack>
      ),
    },
  ]

  const handleSaveBudget = () => {
    setBudget(trip.id, newTotal, newCurrency)
    setEditBudget(false)
  }

  return (
    <PageWrapper $mobile={isMobile}>
      <Stack direction="row" align="center" justify="between">
        <Typography variant="h5" style={{ margin: 0 }}>💰 תקציב</Typography>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
          <Stack direction="row" spacing="xs" align="center">
            <Plus size={14} />
            <span>הוסף הוצאה</span>
          </Stack>
        </Button>
      </Stack>

      {isUsa && (
        <Alert variant="warning" title="בלי המצאות מ-WhatsApp">
          אין סכומי «כבר שולם» עם תאריך לטיול 2027 בצ׳אט. אשראי מול אבנר הוזכר בלי סכום. יתרות כאן הן לספקים; התחשבנות בין בני המשפחה ריקה עד שיהיה הסכם עם סכום.
        </Alert>
      )}

      {overBudget && (
        <Alert variant="error" title="חריגה מהתקציב!">
          {`חרגת ב-${formatCurrency(Math.abs(remaining), currency)} מהתקציב המתוכנן`}
        </Alert>
      )}

      {isUsa ? (
        <Grid columns={isMobile ? 1 : isTablet ? 2 : 3} gap="md">
          <StatCard
            title="מסגרת עם קרוז"
            value={formatUsd(USA_BUDGET_FRAME.withCruiseUsd)}
            icon={<Wallet size={20} />}
            description="אומדן רמי — לא שולם"
            color="#f59e0b"
            onClick={!editBudget ? () => { setNewTotal(totalBudget); setNewCurrency(currency); setEditBudget(true) } : undefined}
          />
          <StatCard
            title="יתרה לספקים"
            value={formatUsd(usaSupplierRemainingUsd())}
            color="#B5630F"
            description="RC 3753418 / 3753537 / 3753278"
          />
          <StatCard
            title="שולם לספק (ידוע)"
            value={formatUsd(usaPaidToSupplierUsd())}
            color="#10b981"
            description="פיקדון אבנר + Refreshment/VOOM של בן"
          />
        </Grid>
      ) : (
        <Grid columns={isMobile ? 1 : isTablet ? 2 : 3} gap="md">
          <StatCard
            title="תקציב כולל"
            value={formatCurrency(totalBudget, currency)}
            icon={<Wallet size={20} />}
            description={editBudget ? '' : 'עדכן תקציב'}
            color="#f59e0b"
            onClick={!editBudget ? () => { setNewTotal(totalBudget); setNewCurrency(currency); setEditBudget(true) } : undefined}
          />
          <StatCard
            title="הוצאות בפועל"
            value={formatCurrency(totalSpent, currency)}
            color={overBudget ? '#ef4444' : '#f59e0b'}
            trend={totalBudget > 0 ? { value: Math.round((totalSpent / totalBudget) * 100) - 100, label: 'מהתקציב' } : undefined}
          />
          <StatCard
            title="יתרה"
            value={formatCurrency(Math.abs(remaining), currency)}
            color={remaining < 0 ? '#ef4444' : '#10b981'}
            description={remaining < 0 ? 'חריגה מהתקציב' : 'נותר לשימוש'}
          />
        </Grid>
      )}

      {editBudget && (
        <Stack direction="row" spacing="sm" align="center">
          <NumberInput value={newTotal} onChange={v => setNewTotal(v ?? 0)} min={0} size="sm" style={{ width: 140 }} />
          <Select value={newCurrency} onChange={e => setNewCurrency(e.target.value)} size="sm" style={{ width: 110 }}>
            {CURRENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Button size="sm" variant="primary" onClick={handleSaveBudget}>שמור</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditBudget(false)}>ביטול</Button>
        </Stack>
      )}

      {isUsa && <UsaBudgetLedger />}

      {!isUsa && Object.keys(byCategory).length > 0 && (
        <Stack direction="column" spacing="sm">
          <Typography variant="h6" style={{ margin: 0 }}>פילוח לפי קטגוריה</Typography>
          {Object.entries(byCategory).map(([cat, vals]) => {
            const pct = totalBudget > 0 ? Math.min((vals.actual / totalBudget) * 100, 100) : 0
            return (
              <Stack key={cat} direction="column" spacing="xs">
                <Stack direction="row" justify="between">
                  <Typography variant="body2">{CATEGORY_LABEL[cat]}</Typography>
                  <Typography variant="body2">{formatCurrency(vals.actual, currency)} / {formatCurrency(vals.planned, currency)}</Typography>
                </Stack>
                <Progress value={pct} variant={vals.actual > vals.planned ? 'danger' : 'primary'} size="sm" />
              </Stack>
            )
          })}
        </Stack>
      )}

      <Stack direction="column" spacing="sm">
        <Typography variant="h6" style={{ margin: 0 }}>
          {isUsa ? 'הוצאות שנוספו ידנית' : 'רשימת הוצאות'}
        </Typography>
        {userItems.length === 0 ? (
          <Typography variant="body2" style={{ color: '#9ca3af', textAlign: 'center', padding: '24px' }}>
            {isUsa ? 'אין הוצאות ידניות. הכללים והיתרות למעלה מגיעים מה-seed, לא מצ׳אט.' : 'לא נוספו הוצאות עדיין'}
          </Typography>
        ) : (
          <Box style={{ overflowX: 'auto' }}>
            <DataTable
              columns={columns}
              data={userItems}
              variant="striped"
              size="sm"
            />
          </Box>
        )}
      </Stack>

      <ExpenseFormModal open={showAdd} onClose={() => setShowAdd(false)} tripId={trip.id} />
      {editItem && (
        <ExpenseFormModal open={!!editItem} onClose={() => setEditItem(undefined)} tripId={trip.id} editItem={editItem} />
      )}
    </PageWrapper>
  )
}
