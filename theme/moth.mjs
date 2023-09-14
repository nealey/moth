/**
 * Hash/digest functions
 */
class Hash {
    /**
     * Dan Bernstein hash
     * 
     * Used until MOTH v3.5
     * 
     * @param {String} buf Input
     * @returns {Number}
     */
    static djb2(buf) {
        let h = 5381
        for (let c of (new TextEncoder()).encode(buf)) { // Encode as UTF-8 and read in each byte
            // JavaScript converts everything to a signed 32-bit integer when you do bitwise operations.
            // So we have to do "unsigned right shift" by zero to get it back to unsigned.
            h = ((h * 33) + c) >>> 0
        }
        return h
    }

    /**
     * Dan Bernstein hash with xor improvement
     * 
     * @param {String} buf Input
     * @returns {Number}
     */
    static djb2xor(buf) {
        let h = 5381
        for (let c of (new TextEncoder()).encode(buf)) {
            h = ((h * 33) ^ c) >>> 0
        }
        return h
    }
  
    /**
     * SHA 256
     * 
     * Used until MOTH v4.5
     * 
     * @param {String} buf Input
     * @returns {Promise.<String>} hex-encoded digest
     */
    static async sha256(buf) {
        const msgUint8 = new TextEncoder().encode(buf)
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return this.hexlify(hashArray);
    }

  /**
   * Hex-encode a byte array
   * 
   * @param {Number[]} buf Byte array
   * @returns {String}
   */
  static hexlify(buf) {
    return buf.map(b => b.toString(16).padStart(2, "0")).join("")   
  }

  /**
   * Apply every hash to the input buffer.
   * 
   * @param {String} buf Input
   * @returns {Promise.<String[]>}
   */
  static async All(buf) {
    return [
        String(this.djb2(buf)),
        String(this.djb2xor(buf)),
        await this.sha256(buf),
    ]
  }
}

/**
 * A point award.
 */
class Award {
    constructor(when, teamid, category, points) {
        /** Unix epoch timestamp for this award 
         * @type {Number}
        */
        this.When = when
        /** Team ID this award belongs to 
         * @type {String}
        */
        this.TeamID = teamid
        /** Puzzle category for this award
         * @type {String}
         */
        this.Category = category
        /** Points value of this award
         * @type {Number}
         */
        this.Points = points
    }
}

/**
 * A puzzle.
 * 
 * A new Puzzle only knows its category and point value.
 * If you want to populate it with meta-information, you must call Populate().
 * 
 * Parameters created by Populate are described in the server source code:
 * {@link https://pkg.go.dev/github.com/dirtbags/moth/v4/pkg/transpile#Puzzle}
 * 
 */
class Puzzle {
    /**
     * @param {Server} server 
     * @param {String} category 
     * @param {Number} points 
     */
    constructor (server, category, points) {
        if (points < 1) {
            throw(`Invalid points value: ${points}`)
        }
        
        /** Server where this puzzle lives
         * @type {Server}
         */
        this.server = server
        
        /** Category this puzzle belongs to */
        this.Category = String(category)
        
        /** Point value of this puzzle */
        this.Points = Number(points)

        /** Error returned trying to fetch this puzzle */
        this.Error = {
            /** Status code provided by server */
            Status: 0,
            /** Status text provided by server */
            StatusText: "",
            /** Full text of server error */
            Body: "",
        }
    }

    /**
     * Populate this Puzzle object with meta-information from the server.
     */
    async Populate() {
        let resp = await this.Get("puzzle.json")
        if (!resp.ok) {
            let body = await resp.text()
            this.Error = {
                Status: resp.status,
                StatusText: resp.statusText,
                Body: body,
            }
            throw(this.Error)
        }
        let obj = await resp.json()
        Object.assign(this, obj)

        // Make sure lists are lists
        this.AnswerHashes ||= []
        this.Answers ||= []
        this.Attachments ||= []
        this.Authors ||= []
        this.Debug.Errors ||= []
        this.Debug.Hints ||= []
        this.Debug.Log ||= []
        this.KSAs ||= []
        this.Scripts ||= []
    }

    /**
     * Get a resource associated with this puzzle.
     * 
     * @param {String} filename Attachment/Script to retrieve
     * @returns {Promise.<Response>}
     */
    Get(filename) {
        return this.server.GetContent(this.Category, this.Points, filename)
    }

    /**
     * Check if a string is possibly correct.
     *
     * The server sends a list of answer hashes with each puzzle: this method
     * checks to see if any of those hashes match a hash of the string.
     *
     * The MOTH development team likes obscure hash functions with a lot of
     * collisions, which means that a given input may match another possible
     * string's hash. We do this so that if you run a brute force attack against
     * the list of hashes, you have to write your own brute force program, and
     * you still have to pick through a lot of potentially correct answers when
     * it's done.
     *
     * @param {String} str User-submitted possible answer
     * @returns {Promise.<Boolean>}
     */
    async IsPossiblyCorrect(str) {
        let userAnswerHashes = await Hash.All(str)

        for (let pah of this.AnswerHashes) {
            for (let uah of userAnswerHashes) {
                if (pah == uah) {
                    return true
                }
            }
        }
        return false
    }

    /**
     * Submit a proposed answer for points.
     *
     * The returned promise will fail if anything goes wrong, including the
     * proposed answer being rejected.
     *
     * @param {String} proposed Answer to submit
     * @returns {Promise.<String>} Success message
     */
    SubmitAnswer(proposed) {
        return this.server.SubmitAnswer(this.Category, this.Points, proposed)
    }
}

/**
 * MOTH instance state.
 */
class State {
    /**
     * @param {Server} server Server where we got this
     * @param {Object} obj Raw state data
     */
    constructor(server, obj) {
        for (let key of ["Config", "Messages", "TeamNames", "PointsLog"]) {
            if (!obj[key]) {
                throw(`Missing state property: ${key}`)
            }
        }
        this.server = server

        /** Configuration */
        this.Config = {
            /** Is the server in development mode?
             * @type {Boolean}
             */
            Devel: obj.Config.Devel,
        }

        /** Global messages, in HTML
         * @type {String}
         */
        this.Messages = obj.Messages

        /** Map from Team ID to Team Name
         * @type {Object.<String,String>}
         */
        this.TeamNames = obj.TeamNames

        /** Map from category name to puzzle point values
         * @type {Object.<String,Number>}
         */
        this.PointsByCategory = obj.Puzzles

        /** Log of points awarded
         * @type {Award[]}
         */
        this.PointsLog = obj.PointsLog.map((t,i,c,p) => new Award(t,i,c,p))
    }

    /**
     * Returns a sorted list of open category names
     * 
     * @returns {String[]} List of categories
     */
    Categories() {
        let ret = []
        for (let category in this.PointsByCategory) {
            ret.push(category)
        }
        ret.sort()
        return ret
    }

    /**
     * Check whether a category has unsolved puzzles.
     * 
     * The server adds a puzzle with 0 points in every "solved" category,
     * so this just checks whether there is a 0-point puzzle in the category's point list.
     * 
     * @param {String} category 
     * @returns {Boolean}
     */
    HasUnsolved(category) {
        return !this.PointsByCategory[category].includes(0)
    }

    /**
     * Is the server in development mode?
     * 
     * @returns {Boolean}
     */
    DevelopmentMode() {
        return this.Config && this.Config.Devel
    }

    /**
     * Return all open puzzles.
     * 
     * The returned list will be sorted by (category, points).
     * If not categories are given, all puzzles will be returned.
     * 
     * @param {String} categories Limit results to these categories
     * @returns {Puzzle[]}
     */
    Puzzles(...categories) {
        if (categories.length == 0) {
            categories = this.Categories()
        }
        let ret = []
        for (let category of categories) {
            for (let points of this.PointsByCategory[category]) {
                if (0 == points) {
                    // This means all potential puzzles in the category are open
                    continue
                }
                let p = new Puzzle(this.server, category, points)
                ret.push(p)
            }
        }
        return ret
    }
}

/**
 * A MOTH Server interface.
 * 
 * This uses localStorage to remember Team ID,
 * and will send a Team ID with every request, if it can find one.
 */
class Server {
    /**
     * @param {String | URL} baseUrl Base URL to server, for constructing API URLs
     */
    constructor(baseUrl) {
        if (!baseUrl) {
            throw("Must provide baseURL")
        }
        this.baseUrl = new URL(baseUrl, location)
        this.teamIdKey = this.baseUrl.toString() + " teamID"
        this.TeamId = localStorage[this.teamIdKey]
    }

    /**
     * Fetch a MOTH resource.
     * 
     * If anything other than a 2xx code is returned,
     * this function throws an error.
     * 
     * This always sends teamId.
     * If args is set, POST will be used instead of GET
     * 
     * @param {String} path Path to API endpoint
     * @param {Object.<String,String>} args Key/Values to send in POST data
     * @returns {Promise.<Response>} Response
     */
    fetch(path, args) {
        let url = new URL(path, this.baseUrl)
        if (this.TeamId & (!(args && args.id))) {
            url.searchParams.set("id", this.TeamId)
        }

        if (args) {
            let formData = new FormData()
            for (let k in args) {
                formData.set(k, args[k])
            }
            return fetch(url, {
                method: "POST",
                body: formData,
            })
        }
        return fetch(url)
    }

    /**
     * Send a request to a JSend API endpoint.
     * 
     * @param {String} path Path to API endpoint
     * @param {Object.<String,String>} args Key/Values to send in POST
     * @returns {Promise.<Object>} JSend Data
     */
    async call(path, args) {
        let resp = await this.fetch(path, args)
        let obj = await resp.json()
        switch (obj.status) {
            case "success":
                return obj.data
            case "fail":
                throw new Error(obj.data.description || obj.data.short || obj.data)
            case "error":
                throw new Error(obj.message)
            default:
                throw new Error(`Unknown JSend status: ${obj.status}`)
        }
    }

    /**
     * Make a new URL for the given resource.
     * 
     * @returns {URL}
     */
    URL(url) {
        return new URL(url, this.baseUrl)
    }

    /**
     * Are we logged in to the server?
     * 
     * @returns {Boolean}
     */
    LoggedIn() {
        return this.TeamId ? true : false
    }

    /**
     * Forget about any previous Team ID.
     * 
     * This is equivalent to logging out.
     */
    Reset() {
        localStorage.removeItem(this.teamIdKey)
        this.TeamId = null
    }

    /**
     * Fetch current contest state.
     * 
     * @returns {Promise.<State>}
     */
    async GetState() {
        let resp = await this.fetch("/state")
        let obj = await resp.json()
        return new State(this, obj)
    }

    /**
     * Log in to a team.
     *
     * This calls the server's registration endpoint; if the call succeds, or
     * fails with "team already exists", the login is returned as successful. 
     *
     * @param {String} teamId 
     * @param {String} teamName 
     * @returns {Promise.<String>} Success message from server
     */
    async Login(teamId, teamName) {
        let data = await this.call("/register", {id: teamId, name: teamName})
        this.TeamId = teamId
        this.TeamName = teamName
        localStorage[this.teamIdKey] = teamId
        return data.description || data.short
    }

    /**
     * Submit a proposed answer for points.
     *
     * The returned promise will fail if anything goes wrong, including the
     * proposed answer being rejected.
     *
     * @param {String} category Category of puzzle
     * @param {Number} points Point value of puzzle
     * @param {String} proposed Answer to submit
     * @returns {Promise.<String>} Success message
     */
    async SubmitAnswer(category, points, proposed) {
        let data = await this.call("/answer", {
            cat: category, 
            points, 
            answer: proposed,
        })
        return data.description || data.short
    }

    /**
     * Fetch a file associated with a puzzle.
     * 
     * @param {String} category Category of puzzle
     * @param {Number} points Point value of puzzle
     * @param {String} filename
     * @returns {Promise.<Response>}
     */
    GetContent(category, points, filename) {
        return this.fetch(`/content/${category}/${points}/${filename}`)
    }

    /**
     * Return a Puzzle object.
     * 
     * New Puzzle objects only know their category and point value.
     * See docstrings on the Puzzle object for more information.
     * 
     * @param {String} category 
     * @param {Number} points 
     * @returns {Puzzle}
     */
    GetPuzzle(category, points) {
        return new Puzzle(this, category, points)
    }
}

export {
    Hash,
    Server,
}