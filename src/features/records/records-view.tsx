"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PagesTable } from "./pages-table";
import { RecordsTable } from "./records-table";

export function RecordsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get("tab") === "sheets" ? "sheets" : "badges";

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        const next = new URLSearchParams(params.toString());
        if (v === "sheets") next.set("tab", "sheets");
        else next.delete("tab");
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    >
      <TabsList>
        <TabsTrigger value="badges">Badges</TabsTrigger>
        <TabsTrigger value="sheets">Printed sheets</TabsTrigger>
      </TabsList>
      <TabsContent value="badges">
        <RecordsTable />
      </TabsContent>
      <TabsContent value="sheets">
        <PagesTable />
      </TabsContent>
    </Tabs>
  );
}
