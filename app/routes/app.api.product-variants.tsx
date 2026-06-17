import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return json({ error: "Missing productId" }, { status: 400 });
  }

  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(
      `query getProductVariants($id: ID!) {
        product(id: $id) {
          title
          options {
            name
            values
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }`,
      {
        variables: { id: productId },
      }
    );

    const data = await response.json();

    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return json({ error: "GraphQL error" }, { status: 500 });
    }

    const product = data.data?.product;
    if (!product) {
      return json({ error: "Product not found" }, { status: 404 });
    }

    const variants = product.variants.edges.map((edge: any) => {
      const variant = edge.node;
      return {
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        options: variant.selectedOptions,
        displayName: variant.title !== "Default Title" ? `${product.title} - ${variant.title}` : product.title,
      };
    });

    return json({
      productTitle: product.title,
      options: product.options,
      variants,
    });
  } catch (error) {
    console.error("Failed to fetch variants", error);
    return json({ error: "Failed to fetch variants" }, { status: 500 });
  }
};
