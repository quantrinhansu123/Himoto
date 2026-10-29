export interface BatteryTelegramState {
  eligible: boolean;
  battery_contract_id: number;
  request_id: string;
  destination_label: string;
  text: string;
  status: string | null;
  can_send: boolean;
  message_count: number;
}

export async function batteryTelegramRequest(batteryId: number, requestId: string, send = false, signal?: AbortSignal): Promise<BatteryTelegramState> {
  const response = await fetch(`/api/auth/battery-contracts/${batteryId}/telegram?request_id=${encodeURIComponent(requestId)}`, {
    method: send ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', signal,
    ...(send ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send', request_id: requestId }) } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== 'success') throw Error(body?.message || 'Không tải được Telegram của hợp đồng pin.');
  return body.data;
}
