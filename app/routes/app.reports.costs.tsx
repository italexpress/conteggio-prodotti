import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit, useActionData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  InlineStack,
  DataTable,
  Modal,
  Select,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { PlusIcon, DeleteIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getFixedCosts, addFixedCost, deleteFixedCost } from "../services/fixed-costs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const costs = await getFixedCosts(session.shop);
  return json({ costs });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add") {
    const name = formData.get("name") as string;
    const category = formData.get("category") as string;
    const monthlyCost = parseFloat(formData.get("monthlyCost") as string);
    const notes = formData.get("notes") as string || "";

    if (!name || isNaN(monthlyCost) || monthlyCost < 0) {
      return json({ error: "Dati non validi" }, { status: 400 });
    }

    await addFixedCost({
      shop: session.shop,
      name,
      category,
      monthlyCost,
      notes,
    });
    return json({ success: true });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    if (id) {
      await deleteFixedCost(id, session.shop);
    }
    return json({ success: true });
  }

  return json({ error: "Invalid intent" }, { status: 400 });
};

export default function FixedCostsPage() {
  const { costs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState({
    name: "",
    category: "other",
    monthlyCost: "",
    notes: "",
  });

  const categoryOptions = [
    { label: "Personale / Dipendenti", value: "employee" },
    { label: "Software / Abbonamenti", value: "software" },
    { label: "Affitto", value: "rent" },
    { label: "Commercialista / Consulenze", value: "accountant" },
    { label: "Utenze", value: "utilities" },
    { label: "Altro", value: "other" },
  ];

  const handleAdd = () => {
    const formData = new FormData();
    formData.append("intent", "add");
    formData.append("name", formState.name);
    formData.append("category", formState.category);
    formData.append("monthlyCost", formState.monthlyCost);
    formData.append("notes", formState.notes);
    
    submit(formData, { method: "post" });
    setModalOpen(false);
    setFormState({ name: "", category: "other", monthlyCost: "", notes: "" });
  };

  const handleDelete = (id: string) => {
    if (confirm("Sei sicuro di voler eliminare questo costo fisso?")) {
      const formData = new FormData();
      formData.append("intent", "delete");
      formData.append("id", id);
      submit(formData, { method: "post" });
    }
  };

  const formatCurrency = (val: number) => `€${val.toFixed(2)}`;

  const totalMonthlyCost = costs.reduce((sum, cost) => sum + cost.monthlyCost, 0);

  const rows = costs.map((cost) => {
    const catLabel = categoryOptions.find(c => c.value === cost.category)?.label || cost.category;
    return [
      <Text as="span" fontWeight="bold">{cost.name}</Text>,
      catLabel,
      cost.notes,
      formatCurrency(cost.monthlyCost),
      <Button icon={DeleteIcon} tone="critical" variant="plain" onClick={() => handleDelete(cost.id)} />
    ];
  });

  return (
    <Page
      backAction={{ content: 'Dashboard', url: '/app/reports' }}
      title="Costi Fissi Mensili"
      primaryAction={
        <Button variant="primary" icon={PlusIcon} onClick={() => setModalOpen(true)}>
          Aggiungi Costo Fisso
        </Button>
      }
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h3">Riepilogo Costi Mensili</Text>
              <Text variant="headingXl" as="span" fontWeight="bold" tone="critical">
                {formatCurrency(totalMonthlyCost)} / mese
              </Text>
            </InlineStack>
            <Text as="p" tone="subdued">
              Questi costi vengono sommati e sottratti al profitto lordo mensile nella dashboard per darti il vero Utile Netto.
            </Text>
          </BlockStack>
        </Card>

        <Card padding="0">
          <DataTable
            columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
            headings={['Nome', 'Categoria', 'Note', 'Costo Mensile', 'Azioni']}
            rows={rows}
            totals={['', '', 'Totale', formatCurrency(totalMonthlyCost), '']}
            totalsName={{ singular: 'Totale', plural: 'Totale' }}
          />
        </Card>
      </BlockStack>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Aggiungi Costo Fisso"
        primaryAction={{
          content: 'Salva Costo',
          onAction: handleAdd,
          disabled: !formState.name || !formState.monthlyCost || parseFloat(formState.monthlyCost) <= 0,
        }}
        secondaryActions={[{ content: 'Annulla', onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Nome costo (es. Stipendio Mario)"
              value={formState.name}
              onChange={(val) => setFormState(prev => ({ ...prev, name: val }))}
              autoComplete="off"
            />
            <Select
              label="Categoria"
              options={categoryOptions}
              value={formState.category}
              onChange={(val) => setFormState(prev => ({ ...prev, category: val }))}
            />
            <TextField
              label="Costo Mensile (€)"
              type="number"
              value={formState.monthlyCost}
              onChange={(val) => setFormState(prev => ({ ...prev, monthlyCost: val }))}
              autoComplete="off"
            />
            <TextField
              label="Note (opzionale)"
              value={formState.notes}
              onChange={(val) => setFormState(prev => ({ ...prev, notes: val }))}
              autoComplete="off"
              multiline={3}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

    </Page>
  );
}
