# Assistant Chat Form Complement

This document describes the **form complement** used by the restaurant-owner assistant chat. The complement is a separate UI block rendered below an assistant message when the backend decides structured input is required.

## Overview

Assistant messages are not limited to plain text. The backend can attach a **complement** — an interactive widget embedded in the chat transcript.

Currently supported complement types:

| Type | Purpose |
|------|---------|
| `form` | Collect structured answers (choices + custom text inputs) |

The frontend component lives at:

- `frontend/src/components/assistant/ChatFormComplement.tsx`
- `frontend/src/lib/assistant/chatComplements.ts`

## Message shape

An assistant message may include optional text **and** an optional complement.

```ts
type AssistantChatMessage = {
  id: string;
  role: "assistant";
  content: string;           // streamed markdown/plain text
  complement?: ChatComplement;
  complementSubmitted?: boolean; // set by frontend after user submits
};
```

When the user submits a form, the frontend:

1. Marks the form as submitted (disables inputs).
2. Adds a **user message** with a human-readable summary.
3. Sends a structured payload (for future API integration).

```ts
type UserChatMessage = {
  id: string;
  role: "user";
  content: string;              // formatted summary for the transcript
  formSubmission?: ChatFormSubmission;
};
```

## Backend response contract

The backend controls **whether** a complement is shown and **what it contains**.

### Recommended response envelope

For a non-streaming response:

```json
{
  "message_id": "msg_01JABC",
  "content": "Perfecto. Para crear el producto, completa este formulario:",
  "complement": {
    "type": "form",
    "id": "product-create-step-1",
    "title": "Nuevo producto",
    "description": "Completa estos datos para continuar.",
    "submitLabel": "Continuar",
    "fields": []
  }
}
```

For streaming, send `content` as token deltas and emit the complement **after** text completes (or in a final SSE event):

```json
{
  "event": "message.complete",
  "message_id": "msg_01JABC",
  "content": "Perfecto. Para crear el producto, completa este formulario:",
  "complement": { "...": "..." }
}
```

If no structured input is needed, omit `complement` entirely.

```json
{
  "message_id": "msg_01JABC",
  "content": "Listo, actualicé tu menú."
}
```

## Form complement schema

```ts
type ChatFormComplement = {
  type: "form";
  id: string;                    // stable id for this step in a multi-step flow
  title?: string;
  description?: string;
  submitLabel?: string;          // default: "Enviar"
  fields: ChatFormField[];
};
```

### Field types

#### 1. Choice (`type: "choice"`)

Presents a question with selectable options (rendered as pill buttons).

```json
{
  "type": "choice",
  "id": "category",
  "label": "¿En qué categoría va?",
  "required": true,
  "options": [
    { "id": "entradas", "label": "Entradas" },
    { "id": "platos", "label": "Platos fuertes" },
    { "id": "bebidas", "label": "Bebidas" }
  ],
  "allowCustomInput": true,
  "customInputLabel": "Otra categoría",
  "customInputPlaceholder": "Escribe la categoría..."
}
```

- `options`: predefined answers; `id` is the value sent back to the backend.
- `allowCustomInput: true`: adds an **Other** option. When selected, a text input appears.
- Custom values use the synthetic option id `__custom__` (constant: `CHAT_FORM_CUSTOM_OPTION_ID`).

#### 2. Text (`type: "text"`)

Free-form input (single line or multiline).

```json
{
  "type": "text",
  "id": "product_name",
  "label": "Nombre del producto",
  "placeholder": "Ej. Tacos al pastor",
  "required": true,
  "multiline": false
}
```

### Shared field properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique within the form; used as key in submission payload |
| `label` | `string` | Visible question label |
| `required` | `boolean` | Client-side validation before submit |
| `helpText` | `string` | Optional helper copy below the label |

## Form submission payload

When the user clicks submit, the frontend produces:

```ts
type ChatFormSubmission = {
  complementId: string;   // matches complement.id
  messageId: string;      // assistant message that contained the form
  values: Record<string, ChatFormFieldValue>;
};

type ChatFormFieldValue =
  | { kind: "choice"; optionId: string; customValue?: string }
  | { kind: "text"; value: string };
```

### Example submission (product form)

```json
{
  "complementId": "product-create-step-1",
  "messageId": "msg_01JABC",
  "values": {
    "category": {
      "kind": "choice",
      "optionId": "__custom__",
      "customValue": "Postres"
    },
    "product_name": {
      "kind": "text",
      "value": "Flan napolitano"
    }
  }
}
```

### Example submission (predefined choice)

```json
{
  "complementId": "promotion-create-step-1",
  "messageId": "msg_01JDEF",
  "values": {
    "discount_type": {
      "kind": "choice",
      "optionId": "percent"
    },
    "discount_value": {
      "kind": "text",
      "value": "15"
    }
  }
}
```

The frontend also posts a readable user message to the transcript:

```
¿En qué categoría va?: Postres
Nombre del producto: Flan napolitano
```

Your API should accept either the structured `formSubmission` object (preferred) or parse the summary text.

## Full backend examples

### Example A — Product creation (choice + custom input + text)

**Assistant response**

```json
{
  "content": "Perfecto. Para crear el producto, completa este formulario:",
  "complement": {
    "type": "form",
    "id": "product-create-step-1",
    "title": "Nuevo producto",
    "description": "Completa estos datos para continuar.",
    "submitLabel": "Continuar",
    "fields": [
      {
        "type": "choice",
        "id": "category",
        "label": "¿En qué categoría va?",
        "required": true,
        "options": [
          { "id": "entradas", "label": "Entradas" },
          { "id": "platos", "label": "Platos fuertes" },
          { "id": "bebidas", "label": "Bebidas" }
        ],
        "allowCustomInput": true,
        "customInputLabel": "Otra categoría",
        "customInputPlaceholder": "Escribe la categoría..."
      },
      {
        "type": "text",
        "id": "product_name",
        "label": "Nombre del producto",
        "placeholder": "Ej. Tacos al pastor",
        "required": true
      }
    ]
  }
}
```

### Example B — Promotion setup

```json
{
  "content": "Entendido. Configura la promoción con estas opciones:",
  "complement": {
    "type": "form",
    "id": "promotion-create-step-1",
    "title": "Nueva promoción",
    "description": "Elige el tipo de descuento.",
    "submitLabel": "Siguiente",
    "fields": [
      {
        "type": "choice",
        "id": "discount_type",
        "label": "Tipo de promoción",
        "required": true,
        "options": [
          { "id": "percent", "label": "Porcentaje (%)" },
          { "id": "fixed", "label": "Monto fijo ($)" },
          { "id": "combo", "label": "Combo / 2x1" }
        ],
        "allowCustomInput": true,
        "customInputLabel": "Otro tipo",
        "customInputPlaceholder": "Describe la promoción..."
      },
      {
        "type": "text",
        "id": "discount_value",
        "label": "Valor del descuento",
        "placeholder": "Ej. 15 o 50",
        "required": true
      }
    ]
  }
}
```

### Example C — Text-only follow-up (no complement)

```json
{
  "content": "Gracias. Recibí tus respuestas y continuaré con el siguiente paso."
}
```

## Multi-step flows

Use stable `complement.id` values per step:

1. `product-create-step-1` → category + name  
2. `product-create-step-2` → price + description  
3. No complement → confirmation message  

The backend should track conversation state server-side. The frontend only renders the complement it receives and returns `complementId` + `values` on submit.

## UI behavior

| State | Behavior |
|-------|----------|
| Active form | User can select options and type values |
| Validation error | Required fields show inline errors |
| Submitted | Inputs disabled, "Enviado" badge shown |
| After submit | User summary bubble added; next assistant reply requested |

## Mock triggers (development)

Until the API is connected, the frontend shows forms when the user message contains:

- `producto` → `MOCK_PRODUCT_FORM`
- `promoción` / `descuento` → `MOCK_PROMOTION_FORM`

## Future complement types

The `ChatComplement` union is designed to grow:

```ts
type ChatComplement = ChatFormComplement; // | ChatConfirmComplement | ...
```

Add new `type` values without breaking existing messages. The frontend should ignore unknown complement types gracefully.

## Integration checklist

- [ ] Stream `content`, then send `complement` in final event
- [ ] Accept `formSubmission` in the next user turn
- [ ] Use stable `complement.id` for multi-step flows
- [ ] Omit `complement` when plain text is enough
- [ ] Validate submitted `optionId` / `value` server-side
