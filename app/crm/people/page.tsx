import SearchListPage from "@/app/components/crm/SearchListPage";
import CreatePersonWizard from "@/app/crm/_shared/CreatePersonWizard";
import { createPersonAction } from "@/app/crm/_shared/mutations";

async function boundCreateAction(fd: FormData) {
  "use server";
  return createPersonAction("/crm/people", fd);
}

export default function PeoplePage() {
  return (
    <SearchListPage
      title="People"
      searchEndpoint="/api/crm/people/search"
      searchPlaceholder="Search by name, email, phone…"
      columns={[
        { key: "name",         label: "Name",         width: 200 },
        { key: "email",        label: "Email",        width: 220 },
        { key: "phone",        label: "Phone",        width: 140 },
        { key: "contact_type", label: "Contact Type", width: 130 },
      ]}
      target="people"
      rowHrefPrefix="/crm/people/"
      headerActions={<CreatePersonWizard action={boundCreateAction} />}
    />
  );
}
