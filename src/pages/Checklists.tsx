import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ChecklistsTab } from "./checklists/ChecklistsTab";

export default function Checklists() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [builderTitle, setBuilderTitle] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("tab") !== "reporting") return;

    const location = searchParams.get("location");
    const reportingParams = new URLSearchParams();

    if (location) {
      reportingParams.set("location", location);
    }

    navigate(
      reportingParams.toString() ? `/reporting?${reportingParams.toString()}` : "/reporting",
      { replace: true },
    );
  }, [navigate, searchParams]);

  const subtitle = builderTitle !== null
    ? builderTitle
      ? `Editing: ${builderTitle}`
      : "New checklist"
    : "Manage your checklists & inspections";

  return (
    <Layout title="Olia" subtitle={subtitle}>
      <ChecklistsTab onBuilderTitleChange={setBuilderTitle} />
    </Layout>
  );
}
