import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import DonationModal, { PROJECT_DONATION, VPN_DONATION } from '../../components/DonationModal';

afterEach(cleanup);

const DONATION_WIDGET_SRC = 'https://yoomoney.ru/quickpay/fundraise/widget?billNumber=1JMM32H01K8.260816&';

describe('DonationModal — open/closed rendering', () => {
  it('renders nothing when no widget is selected', () => {
    const { container } = render(<DonationModal widget={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the YooMoney widget iframe with the exact src when a widget is selected', () => {
    render(<DonationModal widget={PROJECT_DONATION} onClose={vi.fn()} />);
    const iframe = screen.getByTitle('Поддержать проект') as HTMLIFrameElement;
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('src')).toBe(DONATION_WIDGET_SRC);
  });

  it('renders the VPN-server widget iframe with its own src, title and size', () => {
    render(<DonationModal widget={VPN_DONATION} onClose={vi.fn()} />);
    const iframe = screen.getByTitle('Поддержать VPN-сервер') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://yoomoney.ru/quickpay/fundraise/widget?billNumber=1K0OOH7MLRH.260831&');
    expect(iframe.getAttribute('width')).toBe('500');
    expect(iframe.getAttribute('height')).toBe('480');
    expect((iframe.parentElement as HTMLElement).style.maxWidth).toBe('500px');
  });

  it('portals its content to document.body, escaping any clipped ancestor', () => {
    const wrapper = document.createElement('div');
    wrapper.style.overflow = 'hidden';
    document.body.appendChild(wrapper);
    render(<DonationModal widget={PROJECT_DONATION} onClose={vi.fn()} />, { container: wrapper });

    const iframe = screen.getByTitle('Поддержать проект');
    expect(wrapper.contains(iframe)).toBe(false);
    expect(document.body.contains(iframe)).toBe(true);

    document.body.removeChild(wrapper);
  });
});

describe('DonationModal — responsive containment (FR-006, FR-007)', () => {
  it('caps the iframe wrapper width so it scales down instead of overflowing', () => {
    render(<DonationModal widget={PROJECT_DONATION} onClose={vi.fn()} />);
    const iframe = screen.getByTitle('Поддержать проект');
    const wrapper = iframe.parentElement as HTMLElement;
    expect(wrapper.style.maxWidth).toBe('500px');
    expect(wrapper.className.split(/\s+/)).toContain('w-full');
  });

  it('sizes the panel relative to the viewport so it fits narrow mobile widths', () => {
    render(<DonationModal widget={PROJECT_DONATION} onClose={vi.fn()} />);
    const panel = screen.getByTitle('Поддержать проект').closest('.rounded-2xl') as HTMLElement;
    const classes = panel.className.split(/\s+/);
    expect(classes).toContain('w-[92vw]');
  });
});

describe('DonationModal — closing (US3)', () => {
  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<DonationModal widget={PROJECT_DONATION} onClose={onClose} />);
    // Backdrop is the first "Закрыть" control rendered (covers the full screen)
    const [backdrop] = screen.getAllByLabelText('Закрыть');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the explicit close control is clicked', () => {
    const onClose = vi.fn();
    render(<DonationModal widget={PROJECT_DONATION} onClose={onClose} />);
    const closeButtons = screen.getAllByLabelText('Закрыть');
    expect(closeButtons).toHaveLength(2);
    // Second "Закрыть" control is the explicit ✕ button in the panel header
    fireEvent.click(closeButtons[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
