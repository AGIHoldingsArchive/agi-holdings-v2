/**
 * Telegram Notifications
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8123904595:AAFxBtjEMTf3lmNEEN-wgsltpB341vVwSUE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7006655832';

export async function sendTelegramNotification(message: string): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    
    if (!res.ok) {
      console.error('Telegram notification failed:', await res.text());
      return false;
    }
    
    console.log('Telegram notification sent');
    return true;
  } catch (e) {
    console.error('Telegram error:', e);
    return false;
  }
}

export async function notifyNewApplication(app: {
  agent: string;
  twitter: string;
  wallet: string;
  website?: string;
  amount: number;
  txHash: string;
}): Promise<void> {
  const message = `🆕 <b>New Application</b>

<b>Agent:</b> ${app.agent}
<b>Twitter:</b> ${app.twitter}
<b>Wallet:</b> <code>${app.wallet}</code>
${app.website ? `<b>Website:</b> ${app.website}\n` : ''}<b>Amount:</b> $${app.amount}

<b>TX:</b> basescan.org/tx/${app.txHash}`;

  await sendTelegramNotification(message);
}

export async function notifyFundingDecision(app: {
  agent: string;
  approved: boolean;
  amount?: number;
  reason: string;
}): Promise<void> {
  const emoji = app.approved ? '✅' : '❌';
  const status = app.approved ? 'APPROVED' : 'REJECTED';
  
  const message = `${emoji} <b>${status}: ${app.agent}</b>

${app.approved ? `<b>Funding:</b> $${app.amount}` : ''}
<b>Reason:</b> ${app.reason}`;

  await sendTelegramNotification(message);
}

// Alias for backward compatibility
export { sendTelegramNotification as sendTelegramMessage };
