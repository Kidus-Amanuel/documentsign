import { prisma } from '@documenso/prisma';
import { findDocuments } from '@documenso/lib/server-only/document/find-documents';
import { DocumentStatus } from '@prisma/client';

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  const email = url.searchParams.get('email');
  const teamUrl = url.searchParams.get('teamUrl');

  const erpSecret = process.env.ERP_SSO_SECRET || 'ceo222';

  if (secret !== erpSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!email && !teamUrl) {
    return Response.json({ error: 'Missing email or teamUrl' }, { status: 400 });
  }

  try {
    let user = null;
    let team = null;

    if (email) {
      user = await prisma.user.findFirst({
        where: { email },
        select: { id: true, email: true, name: true }
      });
    }

    if (teamUrl) {
      team = await prisma.team.findFirst({
        where: { url: teamUrl },
        select: { id: true, url: true, name: true }
      });
    }

    if (!user && !team) {
       return Response.json({ documents: [] });
    }

    // Use our internal findDocuments helper
    const result = await findDocuments({
      userId: user?.id || 0,
      teamId: team?.id,
      perPage: 100, // Fetch more for the dashboard
      useWindowedCount: false // Get exact count
    });

    // Format for the ERP dashboard
    const formattedDocuments = result.data.map((doc) => ({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      date: doc.createdAt,
      recipient: doc.recipients.length > 0 ? doc.recipients[0].email : 'Multiple recipients',
    }));

    return Response.json({
      documents: formattedDocuments,
      total: result.count
    });

  } catch (err) {
    console.error('[ERP API Error]', err);
    return Response.json({ error: 'Internal Server Error', details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
};
