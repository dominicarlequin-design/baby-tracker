'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../../../lib/theme';
import { TabBar } from '../../../lib/TabBar';
import { usePatternsData } from '../../../lib/patterns';
import { STAGES, SAFETY_RULES, TAGS, stageIndexForAge, recipesForStage } from '../../../lib/recipes';
import { RecipeArt } from '../../../lib/RecipeArt';

export default function RecipesPage() {
  const { loading, config, age, ageShortLabel } = usePatternsData();
  const herStage = stageIndexForAge(age?.decimalMonths ?? null);
  const [picked, setPicked] = useState(null);
  const active = picked ?? herStage;
  const stage = STAGES[active];
  const recipes = recipesForStage(active);
  const tooYoung = age && age.decimalMonths < 6;

  return (
    <div className="wrap">
      <div className="header-row">
        <div>
          <Link href="/patterns" className="header-back-link">‹ Insights</Link>
          <h1>Recipes</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      {loading || !config ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <>
          <p className="recipe-intro">
            {age ? <>Picked for her age. She&apos;s {ageShortLabel}.</> : (
              <>Add her birth date in <Link href="/settings" className="header-settings-link">Profile</Link> to open on her stage.</>
            )}
          </p>

          {tooYoung && (
            <div className="recipe-callout recipe-callout-info">
              <div className="recipe-eyebrow">Not quite yet</div>
              <p>Most babies start solids around 6 months. Signs she&apos;s ready: sits up with support, holds her head steady, and opens her mouth when food comes near. Ask her pediatrician first.</p>
            </div>
          )}

          <div className="recipe-stages" role="tablist" aria-label="Age stage">
            {STAGES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={`recipe-stage${i === active ? ' is-on' : ''}`}
                onClick={() => setPicked(i)}
              >
                <span>{s.label}</span>
                <span className="recipe-stage-badge">{age ? (i === herStage ? 'Her stage' : i < herStage ? 'Done' : 'Coming up') : ''}</span>
              </button>
            ))}
          </div>

          <div className={`recipe-stage-card recipe-stage-${stage.key}`}>
            <div className="recipe-eyebrow">{stage.name} · {stage.texture}</div>
            <p>{stage.desc}</p>
          </div>

          <div className="card recipe-safety">
            <div className="recipe-eyebrow">Before you start</div>
            <ul className="recipe-dots">
              {SAFETY_RULES.map(rule => <li key={rule}>{rule}</li>)}
            </ul>
          </div>

          <div className="stats-caption">{recipes.length} recipes for {stage.name}</div>
          {recipes.map(r => (
            <Link key={r.id} href={`/patterns/recipes/${r.id}`} className="recipe-row">
              <RecipeArt name={r.art} />
              <span className="recipe-row-text">
                <span className="recipe-row-title">{r.title}</span>
                <span className="recipe-row-meta">{r.minutes} min · makes {r.makes}</span>
                <span className="recipe-tags">
                  {r.tags.map(t => <span key={t} className={`recipe-tag recipe-tag-${TAGS[t].tone}`}>{TAGS[t].text}</span>)}
                </span>
              </span>
              <svg className="pattern-nav-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ))}

          <p className="recipe-footnote">
            A general guide, based on CDC and AAP advice. Check with her pediatrician, especially about allergens.
          </p>
        </>
      )}

      <TabBar active="patterns" />
    </div>
  );
}
