import {
  IndexTable,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  EmptyState,
  Button,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import type { UnconfirmedCodOrder } from "../services/orders.server";
import { OrderWhatsApp } from './OrderWhatsApp';

interface UnconfirmedCodListProps {
  orders: UnconfirmedCodOrder[];
  mode?: 'cod' | 'followup';
}

function UnconfirmedCodRow({
  order,
  index,
  isExpanded,
  onToggleExpanded,
  mode,
}: {
  order: UnconfirmedCodOrder;
  index: number;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  mode: 'cod' | 'followup';
}) {
  const fetcher = useFetcher();
  const isAccepting = fetcher.state !== "idle";

  const orderDate = new Date(order.createdAt).toLocaleDateString("it-IT", {
    timeZone: 'Europe/Rome',
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const orderTime = new Date(order.createdAt).toLocaleTimeString("it-IT", {
    timeZone: 'Europe/Rome',
    hour: "2-digit",
    minute: "2-digit",
  });

  const daysAgo = Math.floor(
    (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const urgencyTone = daysAgo >= 3 ? "critical" : daysAgo >= 1 ? "warning" : "info";

  const location = [order.shippingCity, order.shippingProvince]
    .filter(Boolean)
    .join(", ");

  return (
    <IndexTable.Row
      id={order.id}
      key={order.id}
      position={index}
      onClick={onToggleExpanded}
    >
      <IndexTable.Cell>
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {order.name}
            </Text>
            <Badge tone={urgencyTone}>{String(daysAgo === 0
                ? "Oggi"
                : daysAgo === 1
                ? "Ieri"
                : `${daysAgo} giorni fa`)}</Badge>
          </InlineStack>
          {isExpanded && (
            <Box paddingBlockStart="200">
              <BlockStack gap="100">
                {order.items.map((item, i) => (
                  <InlineStack key={i} gap="200">
                    <Text variant="bodySm" as="span" tone="subdued">
                      • {item.title}
                    </Text>
                    <Badge size="small">{String(item.quantity) + " pz"}</Badge>
                  </InlineStack>
                ))}
              </BlockStack>
            </Box>
          )}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {order.customerName}
          </Text>
          {location && (
            <Text variant="bodySm" as="span" tone="subdued">
              📍 {location}
            </Text>
          )}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge>{String(order.itemCount) + " pz"}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          €{parseFloat(order.totalPrice).toFixed(2)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text variant="bodySm" as="span" tone="subdued">
            {orderDate}
          </Text>
          <Text variant="bodySm" as="span" tone="subdued">
            {orderTime}
          </Text>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          {mode === 'followup' && <BlockStack gap="100">
            <Badge tone={order.isCod && !order.codAccepted ? 'warning' : 'info'}>{order.isCod ? (order.codAccepted?'COD accettato':'COD da confermare') : ({PAID:'Pagato',PENDING:'Pagamento in attesa',AUTHORIZED:'Autorizzato',PARTIALLY_PAID:'Parzialmente pagato',PARTIALLY_REFUNDED:'Parzialmente rimborsato'}[order.financialStatus || ''] || order.financialStatus || 'Da verificare')}</Badge>
            <Text as="span" variant="bodySm">{{UNFULFILLED:'Da evadere',PARTIALLY_FULFILLED:'Parzialmente evaso',ON_HOLD:'In sospeso',SCHEDULED:'Programmato',REQUEST_DECLINED:'Richiesta rifiutata'}[order.fulfillmentStatus || ''] || order.fulfillmentStatus || 'Da evadere'}</Text>
          </BlockStack>}
          {mode === 'cod' && <>
          <Badge tone="critical">{"⏳ Da confermare"}</Badge>
          <div onClick={(e) => e.stopPropagation()}>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="acceptCod" />
              <input type="hidden" name="orderId" value={order.id} />
              <Button submit variant="primary" tone="success" loading={isAccepting}>
                Accetta
              </Button>
            </fetcher.Form>
          </div>
          </>}
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell><OrderWhatsApp order={order}/></IndexTable.Cell>
    </IndexTable.Row>
  );
}

export function UnconfirmedCodList({ orders, mode='cod' }: UnconfirmedCodListProps) {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [search,setSearch]=useState('');
  const sortedOrders=[...orders].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
  const visibleOrders=sortedOrders.filter(o=>`${o.name} ${o.customerName} ${o.customerPhone || ''}`.toLowerCase().includes(search.trim().toLowerCase()));

  if (orders.length === 0) {
    return (
      <EmptyState
        heading={mode==='cod'?'Tutti i contrassegni sono stati confermati! 🎉':'Nessun ordine da evadere'}
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>{mode==='cod'?'Non ci sono ordini in contrassegno in attesa di conferma.':'Non risultano ordini ancora da evadere.'}</p>
      </EmptyState>
    );
  }

  const totalValue = orders.reduce(
    (sum, o) => sum + parseFloat(o.totalPrice),
    0
  );
  const totalItems = orders.reduce((sum, o) => sum + o.itemCount, 0);

  const rowMarkup = visibleOrders.map((order, index) => {
    const isExpanded = expandedOrderId === order.id;
    return (
      <UnconfirmedCodRow
        key={order.id}
        order={order}
        mode={mode}
        index={index}
        isExpanded={isExpanded}
        onToggleExpanded={() => setExpandedOrderId(isExpanded ? null : order.id)}
      />
    );
  });

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingSm" as="h3">
          {mode==='cod'?'Ordini in contrassegno senza conferma':'Tutti gli ordini da evadere — dal più vecchio al più nuovo'}
        </Text>
        <InlineStack gap="200">
          <Badge tone="critical">{String(orders.length) + " ordini"}</Badge>
          <Badge tone="warning">{String(totalItems) + " pezzi"}</Badge>
          <Badge>{"€" + String(totalValue.toFixed(2)) + " totale"}</Badge>
        </InlineStack>
      </InlineStack>

      {mode==='followup' && <Banner tone="info">Ordini ancora da evadere, anche parziali, in sospeso o programmati. Esclusi annullati e completamente rimborsati. Clicca sulla riga per vedere i prodotti ancora da spedire.</Banner>}
      {mode==='cod' && <Banner tone="warning">
        <p>
          Questi <strong>{orders.length} ordini</strong> sono in contrassegno
          ma <strong>non hanno il tag "ACCETTATO"</strong> su Shopify.
          Vai su Shopify, apri l'ordine e aggiungi il tag "ACCETTATO" per confermarli.
          Clicca su una riga per vedere i prodotti dell'ordine.
        </p>
      </Banner>}
      {orders.some(o=>o.contactUnavailable) && <Banner tone="warning">Shopify non rende accessibili alcuni dati di contatto. Puoi aprire l’ordine e inserire qui il numero WhatsApp: verrà salvato anche per le prossime visite.</Banner>}
      <TextField label="Cerca ordine, cliente o telefono" value={search} onChange={setSearch} autoComplete="off" clearButton onClearButtonClick={()=>setSearch('')}/>
      {visibleOrders.length===0 && <Text as="p">Nessun ordine corrisponde alla ricerca.</Text>}

      <IndexTable
        itemCount={visibleOrders.length}
        headings={[
          { title: "Ordine" },
          { title: "Cliente" },
          { title: "Pezzi" },
          { title: "Totale" },
          { title: "Data" },
          { title: "Stato" },
          { title: "Contatta cliente" },
        ]}
        selectable={false}
      >
        {rowMarkup}
      </IndexTable>
    </BlockStack>
  );
}
