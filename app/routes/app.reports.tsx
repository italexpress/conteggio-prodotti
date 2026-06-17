import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Icon,
  Button
} from "@shopify/polaris";
import { CashDollarIcon, CalendarIcon, OrderIcon, RefreshIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getRevenueStats } from "../services/reports.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const stats = await getRevenueStats(admin);

  return json({
    stats,
    lastUpdated: new Date().toISOString(),
  });
};

function StatCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: any;
  tone: "success" | "info" | "warning" | "magic";
}) {
  const toneColors: Record<string, string> = {
    success: "#22c55e",
    critical: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
    magic: "#8b5cf6",
  };
  const color = toneColors[tone];

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" as="span" tone="subdued">
            {title}
          </Text>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `${color}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon source={icon} tone={tone === "info" ? "info" : tone === "success" ? "success" : tone === "warning" ? "warning" : "base"} />
          </div>
        </InlineStack>
        <Text variant="heading2xl" as="p" fontWeight="bold">
          {value}
        </Text>
        <Text variant="bodySm" as="span" tone="subdued">
          {subtitle}
        </Text>
      </BlockStack>
    </Card>
  );
}

export default function ReportsIndex() {
  const { stats, lastUpdated } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isRefreshing = navigation.state === "loading";

  const formattedLastUpdated = new Date(lastUpdated).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <Page
      title="Report Fatturato"
      subtitle={`Ultimo aggiornamento: ${formattedLastUpdated}`}
      primaryAction={
        <Button
          icon={RefreshIcon}
          loading={isRefreshing}
          onClick={() => {
            window.location.reload();
          }}
        >
          Aggiorna dati
        </Button>
      }
    >
      <BlockStack gap="600">
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Fatturato Oggi"
              value={`€${stats.today.toFixed(2)}`}
              subtitle={`${stats.totalOrdersToday} ordini validi`}
              icon={CashDollarIcon}
              tone="success"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Fatturato Mese Corrente"
              value={`€${stats.thisMonth.toFixed(2)}`}
              subtitle={`${stats.totalOrdersMonth} ordini validi`}
              icon={CalendarIcon}
              tone="info"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Fatturato Anno Corrente"
              value={`€${stats.thisYear.toFixed(2)}`}
              subtitle={`${stats.totalOrdersYear} ordini validi`}
              icon={OrderIcon}
              tone="magic"
            />
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
