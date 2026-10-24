import Card from '../ui/Card';

export default function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <p className="text-sm text-espresso-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-espresso-900">{value}</p>
    </Card>
  );
}
