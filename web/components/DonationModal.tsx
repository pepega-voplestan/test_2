import { createPortal } from 'react-dom';

export interface DonationWidget {
  title: string;
  src: string;
  width: number;
  height: number;
}

export const PROJECT_DONATION: DonationWidget = {
  title: 'Поддержать проект',
  src: 'https://yoomoney.ru/quickpay/fundraise/widget?billNumber=1JMM32H01K8.260816&',
  width: 500,
  height: 480,
};

export const VPN_DONATION: DonationWidget = {
  title: 'Поддержать VPN-сервер',
  src: 'https://yoomoney.ru/quickpay/fundraise/widget?billNumber=1K0OOH7MLRH.260831&',
  width: 500,
  height: 480,
};

interface DonationModalProps {
  widget: DonationWidget | null;
  onClose: () => void;
}

/**
 * Rendered via a portal to document.body: NotificationDropdown (the only
 * trigger for this modal) has `overflow-hidden` for its own scroll clipping,
 * which would otherwise clip this modal's `fixed inset-0` backdrop to the
 * small dropdown box instead of the full viewport.
 */
const DonationModal = ({ widget, onClose }: DonationModalProps) => {
  if (!widget) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <button
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-th-card text-th-text shadow-2xl ring-1 ring-th-ring/10">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="text-lg font-semibold">{widget.title}</div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg px-2 py-1 text-th-text-3 hover:bg-th-ring/10 hover:text-th-text-2"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 flex justify-center">
          <div className="w-full" style={{ maxWidth: widget.width }}>
            <iframe
              src={widget.src}
              width={widget.width}
              height={widget.height}
              frameBorder={0}
              scrolling="no"
              title={widget.title}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DonationModal;
