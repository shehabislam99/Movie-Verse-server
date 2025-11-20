const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri =
  "mongodb+srv://shihabkhanahab_db_user:uQP90nYtqhBjLwy1@cluster0.dv2qqne.mongodb.net/?appName=Cluster0";

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
  
    const result = await movieCollection
      .find({ rating: { $ne: null } })
      .sort({ rating: -1 }) 
      .limit(5) 
      .toArray();

    res.send(result);
  });
  app.get("/movies-by-genre/:genreName", async (req, res) => {
      const genreName = req.params.genreName;

      const movies = await movieCollection
        .find({ genre: { $regex: genreName, $options: "i" } }) 
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
          .aggregate([{ $unwind: "$genre" },
             { $group: { _id: "$genre" } }])
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
      console.log(req.query)
      const {id} = req.query
      const query = {_id: new ObjectId(id)}
      const result = await movieCollection.findOne(query);
      res.send(result);
    });
       
    app.post("/movie", async (req, res) => {
      const data = req.body;
      const result = await movieCollection.insertOne(data);
      res.send(result);
    });
  app.put('/update-movie/:id',async(res,req)=>{
    const id = req.params.id
    const data = req.body
    const query = {_id:new ObjectId(id)}

    const updateMovie = {
      $set: data
    }
    const result = await movieCollection.updateOne(query,updateMovie)
    res.send(result)
  })
   app.delete("/delete-movie/:id", async (res, req) => {
     const id = req.params.id;
     const data = req.body;
     const query = { _id: new ObjectId(id) };

     const updateMovie = {
       $set: data,
     };
     const result = await movieCollection.updateOne(query, updateMovie);
     res.send(result);
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
  res.send("MovieVerse API is running...");
});

app.get("/movies/:id", (req, res) => {
  const id = parseInt(req.params.id);
  console.log("i need data for id:", id);
  res.send(`Movie ID: ${id} - use /api/movies/${id} for the API`);
});

app.listen(port, () => {
  console.log(`MovieMaster Pro server is running on port: ${port}`);
});
