import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ReportingTab } from "./checklists/ReportingTab";

export default function Reporting() {
  const [searchParams] = useSearchParams();
  const initialLocationId = searchParams.get("location") || undefined;

  return (
    <Layout title="Reporting" subtitle="Logs & compliance overview">
      <ReportingTab initialLocationId={initialLocationId} />
    </Layout>
  );
}
