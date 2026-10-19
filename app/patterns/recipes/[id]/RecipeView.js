'use client';

import Link from 'next/link';
import { ThemeToggle } from '../../../../lib/theme';
import { TabBar } from '../../../../lib/TabBar';
import { STAGES, recipeById } from '../../../../lib/recipes';
import { RecipeArt } from '../../../../lib/RecipeArt';

export default function RecipeView({ id }) {
  const r = recipeById(id);
  const stage = STAGES[r.stage];

  return (
    <div className="wrap">
      <div className="header-row">
        <div>
          <Link href="/patterns/recipes" className="header-back-link">‹ Recipes</Link>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <div className="recipe-hero">
        <RecipeArt name={r.art} size="lg" />
        <div>
          <div className="recipe-eyebrow">{stage.name} · {stage.texture}</div>
          <h1 className="recipe-title">{r.title}</h1>
        </div>
      </div>

      {r.allergen && (
        <div className="recipe-callout recipe-callout-allergen">
          <div className="recipe-eyebrow">First time with {r.allergen.name}</div>
          {r.allergen.notes.map(n => <p key={n}>{n}</p>)}
        </div>
      )}

      <div className="recipe-facts">
        <div className="recipe-fact recipe-fact-time"><span>Time</span><b>{r.minutes} min</b></div>
        <div className="recipe-fact recipe-fact-makes"><span>Makes</span><b>{r.makes}</b></div>
        <div className="recipe-fact recipe-fact-good"><span>Good for</span><b>{r.goodFor}</b></div>
      </div>

      <div className="recipe-callout recipe-callout-soft">
        <p><b>Texture:</b> {r.texture}</p>
      </div>

      <div className="card">
        <div className="recipe-eyebrow">Ingredients</div>
        <ul className="recipe-dots">
          {r.ingredients.map(i => <li key={i}>{i}</li>)}
        </ul>
      </div>

      <div className="card">
        <div className="recipe-eyebrow">How to make it</div>
        <ol className="recipe-steps">
          {r.steps.map(([head, body], i) => (
            <li key={head}>
              <span className="recipe-step-num" aria-hidden="true">{i + 1}</span>
              <span>
                <span className="recipe-step-head">{head}</span>
                <span className="recipe-step-body">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {r.never && (
        <div className="recipe-callout recipe-callout-soft">
          <p>{r.never}</p>
        </div>
      )}

      {r.note && (
        <div className="recipe-callout recipe-callout-soft">
          <p>{r.note}</p>
        </div>
      )}

      <div className="recipe-callout recipe-callout-storage">
        <div className="recipe-eyebrow">Storing</div>
        {r.storage.map(s => <p key={s}>{s}</p>)}
      </div>

      <p className="recipe-footnote">A general guide. Check with her pediatrician, especially about allergens.</p>

      <TabBar active="patterns" />
    </div>
  );
}
