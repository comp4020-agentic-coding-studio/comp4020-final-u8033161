# Crit 10 reflection

## The breakthrough

The breakthrough was testing the live app the way a stranger would, instead of trusting that it worked. The agent told me the identity system was deployed and the logs looked right. But when I opened two windows myself, as "Alice" and "Bob", the page showed Alice twice. I thought it was a bug in how the app tells people apart.

I didn't guess. I told the agent exactly what I saw and asked it to check the evidence. Then I tried a genuinely different browser, and Alice and Jason showed up as two different people. The "bug" was just my test: incognito windows in the same Chrome share one cookie, so they were really the same person. That saved me from "fixing" something that wasn't broken.

The same test showed a real problem that no test had caught: each card showed the author's name stuck to the message, like "Alicedo you have any question". I asked the agent to make the name and the message separate, and checked the live page again afterwards.

## What it changed about me

I want to be someone who checks the real thing before saying it's done. Green tests and "deployed successfully" were true the whole time, but they didn't tell me the page was confusing to read. I also learned to check my own test setup before blaming the code.
