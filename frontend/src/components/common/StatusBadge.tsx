import { Check } from 'lucide-react';
import type { WorkStatus } from '../../types';

export default function StatusBadge({ value }: { value: WorkStatus }) {
  const className =
    value === 'Tamamlandı'
      ? 'status-completed'
      : value === 'Sahada'
        ? 'status-field'
        : 'status-planned';

  return (
    <span className={`status ${className}`}>
      {value === 'Tamamlandı' && <Check size={13} />}
      {value}
    </span>
  );
}
