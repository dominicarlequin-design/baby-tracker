import { notFound } from 'next/navigation';
import { RECIPES, recipeById } from '../../../../lib/recipes';
import RecipeView from './RecipeView';

// Every recipe is static content, so each detail page is prebuilt.
export function generateStaticParams() {
  return RECIPES.map(r => ({ id: r.id }));
}
export const dynamicParams = false;

export default async function RecipePage({ params }) {
  const { id } = await params;
  if (!recipeById(id)) notFound();
  return <RecipeView id={id} />;
}
