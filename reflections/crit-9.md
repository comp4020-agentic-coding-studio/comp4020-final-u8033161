# Crit 9 reflection

## The breakthrough

The breakthrough was a small moment: someone is halfway through a card, and the presenter closes the rung. Before this week, those words were just gone.

My app exists so that feedback is not forgotten, so losing a half-written card goes against the whole point. I compared four options: close right away, keep the draft, accept late cards for a few seconds, or show a 10-second countdown first. I chose the countdown, because late cards would break the order of the ladder. The cost is that every switch takes 10 seconds longer. I wrote this down as ADR 2.

The real lesson came from testing it myself on my phone. The countdown worked, but when the rung switched, my unsent text disappeared. The ADR promised that words are never lost, but the code only kept them in one case. Then the Back button left the saved draft stuck in a locked rung. Each time, the tests passed, and only using the app found the problem.

## What it changed about me

I want to make decisions from what my app is for, not from what is easiest to code. "What happens when two people act at once" sounded like a technical question, but the answer came from my README.

I also learned that writing a promise down is not the same as keeping it. Now, after I write a decision, I test the exact situation it is about, on a real device, before I call it done.
