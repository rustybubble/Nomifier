// Static data loading (/data/*.json). Profiles are never sent here.
import type {
  AppData,
  Families,
  LabelStatus,
  Product,
  Questions,
  TermTables,
  Templates,
} from "../types";

export async function loadAppData(
  baseUrl: string = import.meta.env.VITE_SERVER_URL ?? "",
): Promise<AppData> {
  const get = async <T>(file: string, fallback?: T): Promise<T> => {
    const res = await fetch(`${baseUrl}/data/${file}`);
    if (!res.ok) {
      if (fallback !== undefined) return fallback;
      throw new Error(`${file}: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  };
  const [
    products,
    termTables,
    ratedList,
    templates,
    questions,
    labelStatus,
    families,
  ] = await Promise.all([
    get<Product[]>("products.json"),
    get<TermTables>("term_tables.json"),
    get<Array<{ unii: string }>>("rated_ingredients.json"),
    get<Templates>("templates.json"),
    get<Questions>("questions.json", {}),
    get<LabelStatus>("label_status.json", {}),
    get<Families>("families.json", {}),
  ]);
  return {
    products,
    productsByNdc: new Map(products.map((p) => [p.ndc11, p])),
    termTables,
    rated: new Set(ratedList.map((r) => r.unii)),
    templates,
    questions,
    labelStatus,
    families,
  };
}
