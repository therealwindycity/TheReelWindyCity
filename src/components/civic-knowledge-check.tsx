"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";

const QUESTIONS = [
  {
    prompt: "An item appears on a meeting agenda. What does that establish?",
    options: [
      "The proposal passed and is already in force.",
      "The item was posted for consideration; its outcome still needs to be checked.",
      "The item was approved by residents in a public vote.",
    ],
    answer: 1,
    explanation: "An agenda describes planned business. Check meeting minutes for recorded action and later adopted text for current legal status.",
  },
  {
    prompt: "Where should you verify what a public body did during a meeting?",
    options: [
      "The official minutes and, when needed, the video or adopted document.",
      "A headline or social-media summary by itself.",
      "The agenda, because it predicts the final vote.",
    ],
    answer: 0,
    explanation: "Minutes document the body's recorded action. Video can add context, and adopted text helps establish the final rule.",
  },
  {
    prompt: "What is the safest way to use an automatically captioned transcript?",
    options: [
      "Treat every speaker name and quote as exact.",
      "Use it to find a moment, then verify names and quotes against the official recording.",
      "Use it instead of the official meeting record.",
    ],
    answer: 1,
    explanation: "Transcripts are useful for navigation, but automated captions can mishear words or speakers. Verify before quoting.",
  },
];

export default function CivicKnowledgeCheck() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const question = QUESTIONS[questionIndex];
  const answered = selected !== null;
  const progressValue = finished ? QUESTIONS.length : questionIndex + (answered ? 1 : 0);

  function choose(optionIndex: number) {
    if (answered || finished) return;
    setSelected(optionIndex);
    if (optionIndex === question.answer) setScore((value) => value + 1);
  }

  function nextQuestion() {
    if (questionIndex === QUESTIONS.length - 1) {
      setFinished(true);
      return;
    }
    setQuestionIndex((value) => value + 1);
    setSelected(null);
  }

  function restart() {
    setQuestionIndex(0);
    setSelected(null);
    setFinished(false);
    setScore(0);
  }

  return (
    <section className="gov-knowledge-check" aria-labelledby="gov-quiz-title">
      <div className="gov-quiz-heading">
        <span className="gov-quiz-icon"><CheckCircle2 size={20} aria-hidden="true" /></span>
        <div><p className="gov-kicker">QUICK KNOWLEDGE CHECK</p><h2 id="gov-quiz-title">Can you trace a civic claim?</h2></div>
        {!finished && <span className="gov-quiz-count">{questionIndex + 1} / {QUESTIONS.length}</span>}
      </div>
      <div className="gov-quiz-progress" role="progressbar" aria-label="Knowledge check progress" aria-valuemin={0} aria-valuemax={QUESTIONS.length} aria-valuenow={progressValue}><span style={{ width: `${(progressValue / QUESTIONS.length) * 100}%` }} /></div>
      {finished ? (
        <div className="gov-quiz-complete" role="status">
          <CheckCircle2 size={24} aria-hidden="true" /><div><h3>Field check complete · {score} of {QUESTIONS.length}</h3><p>The reliable habit: follow each claim back to the original posting, recorded action, and final source text.</p></div>
          <button type="button" className="gov-button gov-button-outline" onClick={restart}><RotateCcw size={14} aria-hidden="true" /> Try again</button>
        </div>
      ) : (
        <>
          <h3 className="gov-quiz-question">{question.prompt}</h3>
          <div className="gov-quiz-options" role="group" aria-label={`Answers to question ${questionIndex + 1}`}>
            {question.options.map((option, index) => {
              const isSelected = selected === index;
              const isCorrect = answered && index === question.answer;
              const isWrong = isSelected && index !== question.answer;
              return <button key={option} type="button" className={`${isCorrect ? "correct" : ""}${isWrong ? " incorrect" : ""}`} aria-pressed={isSelected} disabled={answered} onClick={() => choose(index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>;
            })}
          </div>
          {answered && <div className={`gov-quiz-feedback ${selected === question.answer ? "correct" : "review"}`} role="status"><strong>{selected === question.answer ? "That’s right." : "Review the record."}</strong> {question.explanation}</div>}
          {answered && <button type="button" className="gov-button gov-button-primary gov-quiz-next" onClick={nextQuestion}>{questionIndex === QUESTIONS.length - 1 ? "Finish field check" : "Next question"} <ArrowRight size={14} aria-hidden="true" /></button>}
        </>
      )}
    </section>
  );
}
