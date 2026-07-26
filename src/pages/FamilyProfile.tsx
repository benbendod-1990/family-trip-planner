import { useNavigate } from 'react-router-dom'
import { Container, Card, Stack, Typography, Badge, Progress, Button, EmptyState } from 'myk-library'
import AiSettings from '@/components/ai/AiSettings'
import styled from 'styled-components'
import { useArchiveStore } from '@/stores/archiveStore'
import { computeFamilyProfile } from '@/utils/profileCalculator'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { formatDateShort } from '@/utils/date'
import { ArrowRight, Star } from 'lucide-react'

const PageWrapper = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '12px' : '24px')};
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const DNACard = styled(Card)`
  background: linear-gradient(135deg, #1c2130 0%, #2a1a00 100%);
  border: 1.5px solid #f59e0b;
  text-align: center;
  padding: 28px 24px;
`

const BadgeHero = styled.div`
  font-size: 48px;
  margin-bottom: 4px;
`

const StatsGrid = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, 1fr);
  gap: 12px;
`

const StatBox = styled.div`
  background: ${({ theme }) => theme.colors.gray[50]};
  border-radius: 10px;
  padding: 12px;
  text-align: center;
`

const SectionTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray[500]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
`

const Trip = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray[50]};
  margin-bottom: 8px;
`

const PackingTag = styled.span<{ $type: 'always' | 'never' }>`
  display: inline-flex;
  align-items: center;
  background: ${({ $type }) => ($type === 'always' ? '#d1fae5' : '#fee2e2')};
  color: ${({ $type }) => ($type === 'always' ? '#065f46' : '#991b1b')};
  border-radius: 16px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  margin: 3px;
`

const RatingBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
`

function StarDisplay({ value }: { value: number }) {
  return (
    <span style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={14} fill={n <= value ? '#f59e0b' : 'none'} stroke={n <= value ? '#f59e0b' : '#d1d5db'} />
      ))}
    </span>
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  flights: '✈️ טיסות',
  accommodation: '🏨 לינה',
  food: '🍽️ אוכל',
  activities: '🎯 פעילויות',
  transport: '🚌 תחבורה',
  shopping: '🛍️ קניות',
  other: '💰 אחר',
}

export default function FamilyProfile() {
  const navigate = useNavigate()
  const archivedTrips = useArchiveStore(s => s.archivedTrips)
  const { isMobile, isTablet } = useBreakpoint()
  const profile = computeFamilyProfile(archivedTrips)

  return (
    // The only page still on the dark tripTheme — it opts into the dark
    // background explicitly now that the app-wide base is warm/cream.
    <div className="dark-page">
      <Container size="xl" style={{ padding: `0 ${isMobile ? '12px' : '24px'}` }}>
        <PageWrapper $mobile={isMobile}>

          <Stack direction="row" align="center" spacing="md" style={{ paddingTop: 16 }}>
            <Button variant="ghost" onClick={() => navigate('/')} style={{ padding: '4px 8px' }}>
              <Stack direction="row" spacing="xs" align="center">
                <ArrowRight size={16} />
                <span>חזרה</span>
              </Stack>
            </Button>
            <Typography variant="h4" style={{ margin: 0 }}>🧬 הפרופיל המשפחתי שלנו</Typography>
          </Stack>

          <AiSettings />

          {!profile ? (
            <EmptyState
              title="אין עדיין זיכרונות"
              description="סיים טיול ראשון ושמור את הזיכרונות כדי לבנות את הפרופיל המשפחתי"
              actionText="ראה את הטיולים שלי"
              onAction={() => navigate('/')}
            />
          ) : (
            <>
              {/* DNA Hero */}
              <DNACard>
                <BadgeHero>{profile.familyBadge.split(' ')[0]}</BadgeHero>
                <Typography variant="h4" style={{ color: '#f59e0b', margin: '4px 0 8px' }}>
                  {profile.familyBadge}
                </Typography>
                <Typography variant="body2" style={{ color: '#9ca3af' }}>
                  מבוסס על {profile.totalTrips} טיול{profile.totalTrips > 1 ? 'ים' : ''} ו-{profile.totalDays} ימי נסיעה
                </Typography>
              </DNACard>

              {/* Quick stats */}
              <StatsGrid $cols={isMobile ? 2 : isTablet ? 2 : 4}>
                <StatBox>
                  <Typography variant="h4" style={{ margin: '0 0 4px', color: '#f59e0b' }}>{profile.totalTrips}</Typography>
                  <Typography variant="body2" style={{ color: '#6b7280', fontSize: 12 }}>טיולים</Typography>
                </StatBox>
                <StatBox>
                  <Typography variant="h4" style={{ margin: '0 0 4px', color: '#f59e0b' }}>{profile.avgDurationDays}</Typography>
                  <Typography variant="body2" style={{ color: '#6b7280', fontSize: 12 }}>ימים בממוצע</Typography>
                </StatBox>
                <StatBox>
                  <Typography variant="h4" style={{ margin: '0 0 4px', color: '#f59e0b' }}>{profile.avgDailyBudgetPerPerson}₪</Typography>
                  <Typography variant="body2" style={{ color: '#6b7280', fontSize: 12 }}>ליום לנפש</Typography>
                </StatBox>
                <StatBox>
                  <Typography variant="h4" style={{ margin: '0 0 4px', color: profile.budgetAccuracyPct <= 110 ? '#10b981' : '#ef4444' }}>
                    {profile.budgetAccuracyPct}%
                  </Typography>
                  <Typography variant="body2" style={{ color: '#6b7280', fontSize: 12 }}>דיוק תקציבי</Typography>
                </StatBox>
              </StatsGrid>

              {/* Destinations */}
              <Card padding="md">
                <SectionTitle>יעדים שביקרנו</SectionTitle>
                <Stack direction="row" spacing="xs" style={{ flexWrap: 'wrap' }}>
                  {profile.destinations.map(dest => (
                    <Badge key={dest} variant="info">{dest}</Badge>
                  ))}
                </Stack>
              </Card>

              {/* Ratings */}
              <Card padding="md">
                <SectionTitle>דירוגים ממוצעים</SectionTitle>
                {Object.entries(profile.avgRatings).map(([key, val]) => {
                  const labels: Record<string, string> = { food: '🍽️ אוכל', accommodation: '🏨 לינה', activities: '🎯 פעילויות', overall: '⭐ כולל' }
                  return val > 0 ? (
                    <RatingBar key={key}>
                      <Typography variant="body2" style={{ minWidth: 100, fontWeight: 600 }}>{labels[key]}</Typography>
                      <StarDisplay value={Math.round(val)} />
                      <Typography variant="body2" style={{ color: '#9ca3af', fontSize: 12 }}>{val.toFixed(1)}</Typography>
                    </RatingBar>
                  ) : null
                })}
              </Card>

              {/* Top spend categories */}
              {profile.topCategories.length > 0 && (
                <Card padding="md">
                  <SectionTitle>הוצאות ממוצעות לטיול</SectionTitle>
                  {profile.topCategories.map(({ category, avgSpend }) => {
                    const max = profile.topCategories[0].avgSpend
                    const pct = Math.round((avgSpend / max) * 100)
                    const accuracy = profile.categoryAccuracy[category]
                    return (
                      <Stack key={category} direction="column" spacing="xs" style={{ marginBottom: 10 }}>
                        <Stack direction="row" justify="between">
                          <Typography variant="body2" style={{ fontWeight: 600 }}>{CATEGORY_LABELS[category] ?? category}</Typography>
                          <Stack direction="row" spacing="sm" align="center">
                            <Typography variant="body2">{avgSpend.toLocaleString('he-IL')} ₪</Typography>
                            {accuracy && (
                              <Badge
                                variant={accuracy <= 110 ? 'success' : 'warning'}
                                size="sm"
                              >
                                דיוק {accuracy}%
                              </Badge>
                            )}
                          </Stack>
                        </Stack>
                        <Progress value={pct} size="sm" />
                      </Stack>
                    )
                  })}
                </Card>
              )}

              {/* Packing intelligence */}
              {(profile.alwaysPackItems.length > 0 || profile.neverPackItems.length > 0) && (
                <Card padding="md">
                  <SectionTitle>חכמת האריזה שלנו</SectionTitle>
                  {profile.packingWinRate > 0 && (
                    <Typography variant="body2" style={{ marginBottom: 8, color: '#6b7280' }}>
                      {profile.packingWinRate}% מהציוד שנארז אכן שימש
                    </Typography>
                  )}
                  {profile.alwaysPackItems.length > 0 && (
                    <>
                      <Typography variant="body2" style={{ fontWeight: 700, marginBottom: 4 }}>⭐ תמיד שימושי</Typography>
                      <div style={{ marginBottom: 10 }}>
                        {profile.alwaysPackItems.map(item => (
                          <PackingTag key={item} $type="always">{item}</PackingTag>
                        ))}
                      </div>
                    </>
                  )}
                  {profile.neverPackItems.length > 0 && (
                    <>
                      <Typography variant="body2" style={{ fontWeight: 700, marginBottom: 4 }}>🚫 לא שימש בד"כ</Typography>
                      <div>
                        {profile.neverPackItems.map(item => (
                          <PackingTag key={item} $type="never">{item}</PackingTag>
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              )}

              {/* Trip timeline */}
              <Card padding="md">
                <SectionTitle>ציר זמן טיולים</SectionTitle>
                {[...archivedTrips].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)).map(trip => (
                  <Trip key={trip.id}>
                    <Stack direction="row" spacing="sm" align="center">
                      <span style={{ fontSize: 24 }}>{trip.coverEmoji}</span>
                      <Stack direction="column" spacing="xs">
                        <Typography variant="body2" style={{ fontWeight: 600 }}>{trip.name}</Typography>
                        <Typography variant="body2" style={{ color: '#9ca3af', fontSize: 11 }}>
                          {formatDateShort(trip.startDate)} – {formatDateShort(trip.endDate)} · {trip.familySize} נוסעים
                        </Typography>
                      </Stack>
                    </Stack>
                    <Stack direction="column" align="end" spacing="xs">
                      {trip.ratings?.overall > 0 && <StarDisplay value={trip.ratings.overall} />}
                      {trip.budgetActual > 0 && (
                        <Typography variant="body2" style={{ fontSize: 11, color: '#6b7280' }}>
                          {trip.budgetActual.toLocaleString('he-IL')} {trip.currency}
                        </Typography>
                      )}
                    </Stack>
                  </Trip>
                ))}
              </Card>
            </>
          )}
        </PageWrapper>
      </Container>
    </div>
  )
}
