import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function KpiCard({ title, value, helper }: { title: string; value: string; helper?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  )
}
