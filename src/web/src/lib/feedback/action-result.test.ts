import { describe, it, expect, mock } from 'bun:test';
import { actionOk, actionFail, dispatchToast } from './action-result';

describe('ActionResult helpers', () => {
  it('actionOk returns { ok: true, message }', () => {
    const result = actionOk('saved');
    expect(result).toEqual({ ok: true, message: 'saved' });
  });

  it('actionFail returns { ok: false, message }', () => {
    const result = actionFail('denied');
    expect(result).toEqual({ ok: false, message: 'denied' });
  });

  it('dispatchToast calls success when ok=true', () => {
    const mockSuccess = mock();
    const mockError = mock();
    const toaster = { success: mockSuccess, error: mockError };

    dispatchToast({ ok: true, message: 'yay' }, toaster);

    expect(mockSuccess).toHaveBeenCalledTimes(1);
    expect(mockSuccess).toHaveBeenCalledWith('yay');
    expect(mockError).toHaveBeenCalledTimes(0);
  });

  it('dispatchToast calls error when ok=false', () => {
    const mockSuccess = mock();
    const mockError = mock();
    const toaster = { success: mockSuccess, error: mockError };

    dispatchToast({ ok: false, message: 'boom' }, toaster);

    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith('boom');
    expect(mockSuccess).toHaveBeenCalledTimes(0);
  });
});
