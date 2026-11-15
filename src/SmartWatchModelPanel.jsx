import ModelInputPanel from './ModelInputPanel';
import SmartWatchPanel from './SmartWatchPanel';

export default function SmartWatchModelPanel() {
  return (
    <div className="space-y-5">
      <SmartWatchPanel />
      <ModelInputPanel />
    </div>
  );
}