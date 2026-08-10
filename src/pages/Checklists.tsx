import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { ChecklistsTab } from "./checklists/ChecklistsTab";

export default function Checklists() {
  const navigate = useNavigate();
  const { t } = useTranslation("checklists");
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
      ? t("shell.editing", { title: builderTitle })
      : t("shell.newChecklist")
    : t("shell.subtitle");

  return (
    <Layout title="Olia" subtitle={subtitle}>
      <ChecklistsTab onBuilderTitleChange={setBuilderTitle} />
    </Layout>
  );
}
