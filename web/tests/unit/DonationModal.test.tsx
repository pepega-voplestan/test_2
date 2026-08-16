import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import DonationModal from '../../components/DonationModal';

afterEach(cleanup);

const DONATION_WIDGET_SRC = 'https://yoomoney.ru/quickpay/fundraise/widget?billNumber=1JMM32H01K8.260816&';

describe('DonationModal — open/closed rendering', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<DonationModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the YooMoney widget iframe with the exact src when isOpen is true', () => {
    render(<DonationModal isOpen={true} onClose={vi.fn()} />);
    const iframe = screen.getByTitle('Поддержать проект') as HTMLIFrameElement;
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('src')).toBe(DONATION_WIDGET_SRC);
  });

  it('portals its content to document.body, escaping any clipped ancestor', () => {
    const wrapper = document.createElement('div');
    wrapper.style.overflow = 'hidden';
    document.body.appendChild(wrapper);
    render(<DonationModal isOpen={true} onClose={vi.fn()} />, { container: wrapper });

    const iframe = screen.getByTitle('Поддержать проект');
    expect(wrapper.contains(iframe)).toBe(false);
    expect(document.body.contains(iframe)).toBe(true);

    document.body.removeChild(wrapper);
  });
});

describe('DonationModal — responsive containment (FR-006, FR-007)', () => {
  it('caps the iframe wrapper width so it scales down instead of overflowing', () => {
    render(<DonationModal isOpen={true} onClose={vi.fn()} />);
    const iframe = screen.getByTitle('Поддержать проект');
    const wrapper = iframe.parentElement as HTMLElement;
    const classes = wrapper.className.split(/\s+/);
    expect(classes).toContain('max-w-[500px]');
    expect(classes).toContain('w-full');
  });

  it('sizes the panel relative to the viewport so it fits narrow mobile widths', () => {
    render(<DonationModal isOpen={true} onClose={vi.fn()} />);
    const panel = screen.getByTitle('Поддержать проект').closest('.rounded-2xl') as HTMLElement;
    const classes = panel.className.split(/\s+/);
    expect(classes).toContain('w-[92vw]');
  });
});

describe('DonationModal — closing (US3)', () => {
  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<DonationModal isOpen={true} onClose={onClose} />);
    // Backdrop is the first "Закрыть" control rendered (covers the full screen)
    const [backdrop] = screen.getAllByLabelText('Закрыть');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the explicit close control is clicked', () => {
    const onClose = vi.fn();
    render(<DonationModal isOpen={true} onClose={onClose} />);
    const closeButtons = screen.getAllByLabelText('Закрыть');
    expect(closeButtons).toHaveLength(2);
    // Second "Закрыть" control is the explicit ✕ button in the panel header
    fireEvent.click(closeButtons[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
