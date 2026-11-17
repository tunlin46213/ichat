import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { db } from '@/lib/firebase';

export const REPORT_REASONS = [
  'Spam or scam',
  'Harassment or bullying',
  'Hate speech',
  'Nudity or sexual content',
  'Violence or threats',
  'Impersonation',
  'Something else',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * Files a report for review. Reports are write-only for users (see firestore.rules);
 * review them in the Firebase console under the "reports" collection.
 */
export function submitReport(report: {
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  chatId?: string;
  messageId?: string;
  messageText?: string;
}) {
  return addDoc(collection(db, 'reports'), {
    ...report,
    messageText: report.messageText?.slice(0, 1000) ?? null,
    chatId: report.chatId ?? null,
    messageId: report.messageId ?? null,
    status: 'open',
    createdAt: serverTimestamp(),
  });
}
