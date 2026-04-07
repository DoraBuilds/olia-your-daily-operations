import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ChecklistsTab } from "./checklists/ChecklistsTab";

export default function Checklists() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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

  return (
    <Layout title="Checklists" subtitle="Manage your checklists & inspections">
      <ChecklistsTab />
    </Layout>
  );
}
