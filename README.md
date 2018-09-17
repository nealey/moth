Dirtbags Monarch Of The Hill Server
=====================

This is a set of thingies to run our Monarch-Of-The-Hill contest,
which in the past has been called
"Tracer FIRE",
"Project 2",
"HACK",
"Queen Of The Hill",
"Cyber Spark",
"Cyber Fire",
"Cyber Fire Puzzles",
and "Cyber Fire Foundry".

Information about these events is at
http://dirtbags.net/contest/

This software serves up puzzles in a manner similar to Jeopardy.
It also tracks scores,
and comes with a JavaScript-based scoreboard to display team rankings.


How everything works
---------------------------

This section wound up being pretty long.
Please check out [the overview](docs/overview.md)
for details.


Getting Started Developing
-------------------------------

If you don't have a `puzzles` directory,
you can copy the example puzzles as a starting point:

    $ cp -r example-puzzles puzzles

Then launch the development server:

    $ python3 tools/devel-server.py

Point a web browser at http://localhost:8080/
and start hacking on things in your `puzzles` directory.

More on how the devel sever works in
[the devel server documentation](docs/devel-server.md)


Running A Production Server
====================

Run `dirtbags/moth` (Docker) or `mothd` (native).

`mothd` assumes you're running a contest out of `/moth`.
For Docker, you'll need to bind-mount your actual directories
(`state`, `mothballs`, and optionally `resources`) into
`/moth/`.

You can override any path with an option,
run `mothd -help` for usage.


State Directory
===============


Pausing scoring
-------------------

Create the file `state/disabled`
to pause scoring,
and remove it to resume.
You can use the Unix `touch` command to create the file:

    touch state/disabled

When scoring is paused,
participants can still submit answers,
and the system will tell them whether the answer is correct.
As soon as you unpause,
all correctly-submitted answers will be scored.


Resetting an instance
-------------------

Remove the file `state/initialized`,
and the server will zap everything.


Setting up custom team IDs
-------------------

The file `state/teamids.txt` has all the team IDs,
one per line.
This defaults to all 4-digit natural numbers.
You can edit it to be whatever strings you like.

We sometimes to set `teamids.txt` to a bunch of random 8-digit hex values:

    for i in $(seq 50); do od -x /dev/urandom | awk '{print $2 $3; exit;}'; done

Remember that team IDs are essentially passwords.


Mothball Directory
==================

Installing puzzle categories
-------------------

The development server will provide you with a `.mb` (mothball) file,
when you click the `[mb]` link next to a category.

Just drop that file into the `mothballs` directory,
and the server will pick it up.

If you remove a mothball,
the category will vanish,
but points scored in that category won't!



Resources Directory
===================


Making it look better
-------------------

`mothd` provides some built-in HTML for rendering a complete contest,
but it's rather bland.
You can override everything by dropping a new file into the `resources` directory:

* `basic.css` is used by the default HTML to pretty things up
* `index.html` is the landing page, which asks to register a team
* `puzzle.html` and `puzzle.js` render a puzzle from JSON
* `puzzle-list.html` and `puzzle-list.js` render the list of active puzzles from JSON
* `scoreboard.html` and `scoreboard.js` render the current scoreboard from JSON
* Any other file in the `resources` directory will be served up, too.

If you don't want to read through the source code, I don't blame you.
Run a `mothd` server and pull the various static resources into your `resources` directory,
and then you can start hacking away at them.


Changing scoring
--------------

Believe it or not,
scoring is determined client-side in the scoreboard,
from the points log.
You can hack in whatever algorithm you like.

If you do hack in a new algorithm,
please be a dear and email it to us.
We'd love to see it!

