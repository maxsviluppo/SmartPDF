
import { GoogleGenAI, Type } from "@google/genai";
import { FormField } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeDocument(imageB64: string): Promise<{ title: string; fields: FormField[] }> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageB64,
            },
          },
          {
            text: "Analyze this document image. Identify all potential form fields that a user would need to fill out. Provide a list of fields with a descriptive label, a suitable type (text, number, date, boolean, email), and a placeholder. Also provide a title for the document. Return strictly JSON.",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          fields: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                type: { type: Type.STRING, description: "One of: text, number, date, boolean, email" },
                placeholder: { type: Type.STRING },
              },
              required: ["id", "label", "type"],
            },
          },
        },
        required: ["title", "fields"],
      },
    },
  });

  try {
    const data = JSON.parse(response.text || "{}");
    // Ensure value is initialized
    data.fields = data.fields.map((f: any) => ({
      ...f,
      value: f.type === 'boolean' ? false : '',
    }));
    return data;
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    throw new Error("Failed to extract form data from document.");
  }
}

export async function prefillDocument(title: string, fields: FormField[]): Promise<Record<string, string | boolean>> {
  const fieldList = fields.map(f => `${f.label} (${f.type})`).join(", ");
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        text: `Suggest realistic sample values for these form fields in a document titled "${title}". 
        Fields: ${fieldList}. 
        Return a JSON object where keys are the labels and values are the suggested values. 
        Ensure types match (booleans for boolean fields, date strings for dates).`,
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Failed to prefill", error);
    return {};
  }
}
