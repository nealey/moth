package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/spf13/afero"
)

const TestParticipantID = "shipox"

func (hs *HTTPServer) TestRequest(path string, args map[string]string) *httptest.ResponseRecorder {
	vals := url.Values{}
	vals.Set("pid", TestParticipantID)
	vals.Set("id", TestTeamID)
	for k, v := range args {
		vals.Set(k, v)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(
		"GET",
		fmt.Sprintf("%s?%s", path, vals.Encode()),
		bytes.NewReader([]byte{}),
	)
	hs.ServeHTTP(recorder, request)
	return recorder
}

func TestHttpd(t *testing.T) {
	server := NewTestServer()
	hs := NewHTTPServer("/", server)

	if r := hs.TestRequest("/", nil); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	}

	if r := hs.TestRequest("/index.html", nil); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	}
	if r := hs.TestRequest("/rolodex.html", nil); r.Result().StatusCode != 404 {
		t.Error(r.Result())
	}

	if r := hs.TestRequest("/state", nil); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if r.Body.String() != `{"Config":{"Devel":false},"Messages":"messages.html","TeamNames":{},"PointsLog":[],"Puzzles":{}}` {
		t.Error("Unexpected state", r.Body.String())
	}

	if r := hs.TestRequest("/register", map[string]string{"id": "bad team id", "name": "GoTeam"}); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if r.Body.String() != `{"status":"fail","data":{"short":"not registered","description":"team ID not found in list of valid team IDs"}}` {
		t.Error("Register bad team ID failed")
	}

	if r := hs.TestRequest("/register", map[string]string{"name": "GoTeam"}); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if r.Body.String() != `{"status":"success","data":{"short":"registered","description":"team ID registered"}}` {
		t.Error("Register failed")
	}

	if r := hs.TestRequest("/register", map[string]string{"name": "GoTeam"}); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if r.Body.String() != `{"status":"success","data":{"short":"already registered","description":"team ID has already been registered"}}` {
		t.Error("Register failed", r.Body.String())
	}

	if r := hs.TestRequest("/state", nil); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if r.Body.String() != `{"Config":{"Devel":false},"Messages":"messages.html","TeamNames":{"self":"GoTeam"},"PointsLog":[],"Puzzles":{"pategory":[1]}}` {
		t.Error("Unexpected state", r.Body.String())
	}

	if r := hs.TestRequest("/content/pategory", nil); r.Result().StatusCode != 404 {
		t.Error(r.Result())
	}

	if r := hs.TestRequest("/content/pategory/1/not-here", nil); r.Result().StatusCode != 404 {
		t.Error(r.Result())
	}

	if r := hs.TestRequest("/content/pategory/2/moo.txt", nil); r.Result().StatusCode != 404 {
		t.Error(r.Result())
	}

	if r := hs.TestRequest("/content/pategory/1/", nil); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	}

	if r := hs.TestRequest("/content/pategory/1/moo.txt", nil); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if r.Body.String() != `moo` {
		t.Error("Unexpected body", r.Body.String())
	}

	if r := hs.TestRequest("/answer", map[string]string{"cat": "pategory", "points": "1", "answer": "moo"}); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if r.Body.String() != `{"status":"fail","data":{"short":"not accepted","description":"incorrect answer"}}` {
		t.Error("Unexpected body", r.Body.String())
	}

	if r := hs.TestRequest("/answer", map[string]string{"cat": "pategory", "points": "1", "answer": "answer123"}); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if strings.Contains(r.Body.String(), "incorrect answer") {
		// Pernicious intermittent bug
		t.Error("Incorrect answer that was actually correct")
		for _, provider := range server.PuzzleProviders {
			if mb, ok := provider.(*Mothballs); !ok {
				t.Error("Provider is not a mothball")
			} else {
				cat, _ := mb.getCat("pategory")
				f, _ := cat.Open("answers.txt")
				defer f.Close()
				answersBytes, _ := ioutil.ReadAll(f)
				t.Errorf("Correct answers: %v", string(answersBytes))
			}
		}
		t.Error("Wrong answer")
	} else if r.Body.String() != `{"status":"success","data":{"short":"accepted","description":"1 points awarded in pategory"}}` {
		t.Error("Unexpected body", r.Body.String())
	}

	server.State.refresh()

	if r := hs.TestRequest("/content/pategory/2/puzzle.json", nil); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	}

	state := StateExport{}
	if r := hs.TestRequest("/state", nil); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if err := json.Unmarshal(r.Body.Bytes(), &state); err != nil {
		t.Error(err)
	} else if len(state.PointsLog) != 1 {
		switch v := server.State.(type) {
		case *State:
			log.Print(v)
		}

		t.Errorf("Points log wrong length. Wanted 1, got %v", state.PointsLog)
	} else if len(state.Puzzles["pategory"]) != 2 {
		t.Error("Didn't unlock next puzzle")
	}

	if r := hs.TestRequest("/answer", map[string]string{"cat": "pategory", "points": "1", "answer": "answer123"}); r.Result().StatusCode != 200 {
		t.Error(r.Result())
	} else if strings.Contains(r.Body.String(), "incorrect answer") {
		// Pernicious intermittent bug
		t.Error("Incorrect answer that was actually correct")
		for _, provider := range server.PuzzleProviders {
			if mb, ok := provider.(*Mothballs); !ok {
				t.Error("Provider is not a mothball")
			} else {
				if cat, ok := mb.getCat("pategory"); !ok {
					t.Error("opening pategory failed")
				} else if f, err := cat.Open("answers.txt"); err != nil {
					t.Error("opening answers.txt", err)
				} else {
					defer f.Close()
					answersBytes, _ := ioutil.ReadAll(f)
					t.Errorf("Correct answers: %#v len %d", string(answersBytes), len(answersBytes))
				}
			}
		}
		t.Error("Wrong answer")
	} else if r.Body.String() != `{"status":"fail","data":{"short":"not accepted","description":"error awarding points: points already awarded to this team in this category"}}` {
		t.Error("Unexpected body", r.Body.String())
	}
}

func TestDevelMemHttpd(t *testing.T) {
	srv := NewTestServer()

	{
		hs := NewHTTPServer("/", srv)

		if r := hs.TestRequest("/mothballer/pategory.md", nil); r.Result().StatusCode != 404 {
			t.Error("Should have gotten a 404 for mothballer in prod mode")
		}
	}

	{
		srv.Config.Devel = true
		hs := NewHTTPServer("/", srv)

		if r := hs.TestRequest("/mothballer/pategory.md", nil); r.Result().StatusCode != 500 {
			t.Log(r.Body.String())
			t.Log(r.Result())
			t.Error("Should have given us an internal server error, since category is a mothball")
		}
	}
}

func TestDevelFsHttps(t *testing.T) {
	fs := afero.NewBasePathFs(afero.NewOsFs(), "testdata")
	transpilerProvider := NewTranspilerProvider(fs)
	srv := NewMothServer(Configuration{Devel: true}, NewTestTheme(), NewTestState(), transpilerProvider)
	hs := NewHTTPServer("/", srv)

	if r := hs.TestRequest("/mothballer/cat0.mb", nil); r.Result().StatusCode != 200 {
		t.Log(r.Body.String())
		t.Log(r.Result())
		t.Error("Didn't get a Mothball")
	}
}
