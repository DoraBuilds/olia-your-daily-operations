import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ReportingTab } from "./checklists/ReportingTab";

const VALID_STATUSES = ["all", "completed", "unfinished", "unstarted"] as const;
type ReportingStatus = typeof VALID_STATUSES[number];

export default function Reporting() {
  const [searchParams] = useSearchParams();
  const initialLocationId = searchParams.get("location") || undefined;
  const statusParam = searchParams.get("status");
  const initialStatus = VALID_STATUSES.includes(statusParam as ReportingStatus)
    ? (statusParam as ReportingStatus)
    : undefined;

  return (
    <Layout>
      <ReportingTab initialLocationId={initialLocationId} initialStatus={initialStatus} />
    </Layout>
  );
}
