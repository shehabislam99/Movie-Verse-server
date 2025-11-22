const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { credential } = require("firebase-admin");
const app = express();
const port = process.env.PORT || 3000;

var admin = require("firebase-admin");

var serviceAccount = require("path/to/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.Db_USERNAME}:${process.env.Db_Password}.dv2qqne.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("Movie-data");
    const movieCollection = db.collection("movie");

app.get("/top-rated-movies", async (req, res) => {
  const min = parseFloat(req.query.minRating) || 0;
  const max = parseFloat(req.query.maxRating) || 10;

  const allMovies = await movieCollection
    .find({ rating: { $ne: null, $exists: true } })
    .toArray();

  const topRatedMovies = allMovies
    .map((movie) => ({
      ...movie,
      numericRating: parseFloat(movie.rating) || 0,
    }))
    .filter((movie) => movie.numericRating >= min && movie.numericRating <= max)
    .sort((a, b) => b.numericRating - a.numericRating)
    .slice(0, 5)
    .map(({ numericRating, ...movie }) => movie);

  res.send(topRatedMovies);
});

    app.get("/recent-movies", async (req, res) => {
      const result = await movieCollection
        .find({})
        .sort({ _id: -1 })
        .limit(10)
        .toArray();
      res.send(result);
    });
    app.get("/movies-by-genre/:genreName", async (req, res) => {
      const genreName = req.params.genreName;

      const movies = await movieCollection
        .find({ genre: { $in: [genreName] } })
        .toArray();

      res.send(movies);
    });

    app.get("/stats", async (req, res) => {
      const totalMovies = await movieCollection.countDocuments();

      const allMovies = await movieCollection.find({}).toArray();

      const validRatings = allMovies
        .map((m) => {
          const r = parseFloat(m.rating);
          return isNaN(r) ? null : r;
        })
        .filter((r) => r !== null && r > 0);

      const averageRating =
        validRatings.length > 0
          ? Number(
              (
                validRatings.reduce((a, b) => a + b, 0) / validRatings.length
              ).toFixed(1)
            )
          : 0;

      const genres = await movieCollection
        .aggregate([{ $unwind: "$genre" }, { $group: { _id: "$genre" } }])
        .toArray();

      const totalGenres = genres.length;

      res.json({
        totalMovies,
        averageRating,
        totalGenres,
      });
    });

    app.get("/get-all-movies", async (req, res) => {
      const result = await movieCollection.find().toArray();
      res.send(result);
    });

    app.get("/single-movies", async (req, res) => {
      const { id } = req.query;
      const query = { _id: new ObjectId(id) };
      const result = await movieCollection.findOne(query);
      res.send(result);
    });

    app.post("/add-movie", async (req, res) => {
      const data = req.body;
      const result = await movieCollection.insertOne(data);
      res.send(result);
    });
       app.get("/my-movie-watchlist", async (req, res) => {
           const { email } = req.query;   
           const result = await movieCollection
             .find({ addedBy: email })
             .sort({ _id: -1 })
             .toArray();
           res.send(result);
         
       });
    app.put("/update-movie/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      delete data._id;
      const query = { _id: new ObjectId(id) };

      const updateMovie = { $set: data };

      const result = await movieCollection.updateOne(query, updateMovie);
      res.send(result);
    });
    app.delete("/delete-movie", async (req, res) => {
      const { id } = req.query;
      const query = { _id: new ObjectId(id) };

      const result = await movieCollection.deleteOne(query);
      res.send(result);
    });
    const collectionCollection = db.collection("collection");
    app.post("/add-to-collection", async (req, res) => {
      const data = req.body;

      const result = await collectionCollection.insertOne(data);
      res.json(result);
    });
    app.get("/get-all-collection", async (req, res) => {
      const email = req.query.email;
      const query = email ? { addedBy: email } : {};
      const result = await collectionCollection.find(query).toArray();
      res.json(result);
    });

    app.delete("/delete-collection", async (req, res) => {
      const { id } = req.query;
      const result = await collectionCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("MovieVerse API is running..");
});

app.get("/movies/:id", (req, res) => {
  const id = parseInt(req.params.id);
  console.log("i need data for id:", id);
  res.send(`Movie ID: ${id} - use /api/movies/${id} for the API`);
});

app.listen(port, () => {
  console.log(`MovieMaster Pro server is running on port: ${port}`);
});
