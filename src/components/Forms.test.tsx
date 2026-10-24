// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CompareForm } from './Forms';

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:photo-preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

function fillForm() {
  const file = new File(['photo'], 'store-price.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText('選擇比價照片'), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText('物品名稱', { exact: false }), { target: { value: '洗衣精' } });
  fireEvent.change(screen.getByLabelText('比價地點 / 商家', { exact: false }), { target: { value: '全聯中山店' } });
  fireEvent.change(screen.getByLabelText('比價金額', { exact: false }), { target: { value: '129.50' } });
  return file;
}

describe('拍照比價表單', () => {
  it('previews the chosen photo and submits it together with location and amount', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CompareForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    const photoFile = fillForm();
    expect(screen.getByAltText('比價照片預覽')).toHaveAttribute('src', 'blob:photo-preview');
    expect(screen.getByLabelText('選擇比價照片')).not.toHaveAttribute('capture');
    expect(screen.getByLabelText('拍攝比價照片')).toHaveAttribute('capture', 'environment');
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: '洗衣精', photoFile, firstPrice: expect.objectContaining({ merchant: '全聯中山店', unitPrice: 129.5 }),
    })));
  });

  it('shows upload errors inside the form, retains values and allows retry', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('照片上傳失敗：Storage policy')).mockResolvedValueOnce(undefined);
    render(<CompareForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('照片上傳失敗');
    expect(screen.getByLabelText('比價金額', { exact: false })).toHaveValue(129.5);
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });

  it('rejects unsupported photo formats before submitting', () => {
    render(<CompareForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('選擇比價照片'), { target: { files: [new File(['x'], 'image.gif', { type: 'image/gif' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('請選擇 JPG');
    expect(screen.queryByAltText('比價照片預覽')).not.toBeInTheDocument();
  });
});
