import type { Metadata } from "next";
import DownloadClient from "./DownloadClient";

export const metadata: Metadata = {
  title: "Get SitRep on Your Device",
  description:
    "Install SitRep as an app on your phone or tablet. No app store required.",
};

export default function DownloadPage() {
  return <DownloadClient />;
}
