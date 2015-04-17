#! /usr/bin/lua

local cgi = {}

cgi.POST_MAX = 512
local getc = {}

function cgi.http_error(code, name, info)
	print(code .. " " .. name)
	print("Allow: GET POST")
	print("Content-type: text/html")
	print()
	print("<h1>" .. code .. " " .. name .. "</h1>")
	print("<p>" .. info .. "</p>")
	os.exit(0)
end

function cgi.init()
	method = os.getenv("REQUEST_METHOD")
	if (method == "POST") then
		if (os.getenv("HTTP_CONTENT_TYPE") ~= "application/x-www-form-urlencoded") then
			cgi.http_error(415, "Unsupported content-type", "You are sending me data in a format I can't process")
		end
		
		local CL = tonumber(os.getenv("CONTENT_LENGTH")) or 0
		if (CL > cgi.POST_MAX) then
			cgi.http_error(413, "Post Data Too Long", "You are sending me more data than I'm prepared to handle")
		end
		
		function getc()
			if (CL > 0) then
				CL = CL - 1
				return io.read(1)
			else
				return nil
			end
		end
	elseif (method == "GET") then
		local query = os.getenv("QUERY_STRING") or ""
		local query_pos = 0
		local query_len = string.len(query)
		if (query_len > cgi.POST_MAX) then
			cgi.http_error(413, "Query Data Too Long", "You are sending me more data than I'm prepared to handle")
		end
		
		function getc()
			if (query_pos < query_len) then
				query_pos = query_pos + 1
				return string.sub(query, query_pos, query_pos)
			else
				return nil
			end
		end
	else
		cgi.http_error(405, "Method not allowed", "I only do GET and POST.")
	end
end

function cgi.read_hex()
	local a = getc() or 0
	local b = getc() or 0

	return string.char(tonumber(a, 16)*16 + tonumber(b, 16))
end

function cgi.item()
	local val = ""

	while (true) do
		local c = getc()
		if ((c == nil) or (c == "=") or (c == "&")) then
			return val
		elseif (c == "%") then
			c = read_hex()
		elseif (c == "+") then
			c = " "
		end
		val = val .. c
	end
end

function cgi.escape(s)
	s = string.gsub(s, "&", "&amp;")
	s = string.gsub(s, "<", "&lt;")
	s = string.gsub(s, ">", "&gt;")
	return s
end

return cgi

