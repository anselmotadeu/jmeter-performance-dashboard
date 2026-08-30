import { redirect } from 'next/navigation';
import { userHasProductAccess } from '@/lib/subscription';

export async function requireProductPageAccess(userId: string): Promise<void> {
  if (!await userHasProductAccess(userId)) redirect('/pricing?access=expired');
}
