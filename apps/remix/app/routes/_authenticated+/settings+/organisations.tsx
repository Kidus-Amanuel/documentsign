import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useSession } from '@documenso/lib/client-only/providers/session';

import { OrganisationCreateDialog } from '~/components/dialogs/organisation-create-dialog';
import { OrganisationInvitations } from '~/components/general/organisations/organisation-invitations';
import { SettingsHeader } from '~/components/general/settings-header';
import { UserOrganisationsTable } from '~/components/tables/user-organisations-table';

export default function TeamsSettingsPage() {
  const { _ } = useLingui();
  const { user } = useSession();

  return (
    <div>
      <SettingsHeader
        title={_(msg`Organisations`)}
        subtitle={
          user.source === 'ERP_SSO'
            ? _(msg`Your default organisation associated with the ERP.`)
            : _(msg`Manage all organisations you are currently associated with.`)
        }
      >
        {user.source !== 'ERP_SSO' && <OrganisationCreateDialog />}
      </SettingsHeader>

      <UserOrganisationsTable />

      <div className="mt-8 space-y-8">
        <OrganisationInvitations />
      </div>
    </div>
  );
}
