
cd ..
port=9003
lsof -ti tcp:$port | xargs -r kill -9
python3 serve_coi.py

# http://127.0.0.1:9003/movie_compress.html
