import { useState } from 'react';
import { Activity } from 'lucide-react';
import ModelInputPanel from './ModelInputPanel';
import SmartWatchPanel from './SmartWatchPanel';

export default function SmartWatchModelPanel() {
  const [watchReading, setWatchReading] = useState(null);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-[#007AFF]/5 p-4 ring-1 ring-[#007AFF]/10">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#007AFF]" />
          <h2 className="text-sm font-bold text-gray-900">
            Live heart rate is linked to the XGBoost inputs
          </h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-gray-600">
          When the watch reports a new pulse, its BPM fills the heart-rate slider and
          automatically runs XGBoost with the current values of the other model inputs.
        </p>
      </div>
      <SmartWatchPanel onHeartRateChange={setWatchReading} />
      <ModelInputPanel watchReading={watchReading} />
    </div>
  );
}
