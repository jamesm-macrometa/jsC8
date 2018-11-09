import { expect } from "chai";
import { Fabric } from "../jsC8";
import { DocumentCollection } from "../collection";
import { ArrayCursor } from "../cursor";
import { getDCListString } from "../util/helper";

const range = (n: number): number[] => Array.from(Array(n).keys());
const alpha = (i: number): string => String.fromCharCode("a".charCodeAt(0) + i);
const C8_VERSION = Number(process.env.C8_VERSION || 30400);
const describe2x = C8_VERSION < 30000 ? describe : describe.skip;

describe("Simple queries", function () {
  // create fabric takes 11s in a standard cluster
  this.timeout(20000);

  let name = `testdb_${Date.now()}`;
  let fabric: Fabric;
  const testUrl = process.env.TEST_C8_URL || "https://default.dev.macrometa.io";

  let dcList: string;
  let collection: DocumentCollection;
  before(async () => {
    fabric = new Fabric({
      url: testUrl,
      c8Version: C8_VERSION
    });

    const response = await fabric.getAllEdgeLocations();
    dcList = getDCListString(response);

    await fabric.createFabric(name, [{ username: 'root' }], { dcList: dcList, realTime: false });
    fabric.useFabric(name);
  });
  after(async () => {
    try {
      fabric.useFabric("_system");
      await fabric.dropFabric(name);
    } finally {
      fabric.close();
    }
  });
  beforeEach(done => {
    collection = fabric.collection(`c_${Date.now()}`);
    collection
      .create()
      .then(() =>
        range(10).reduce(
          (p, v) =>
            p.then(() =>
              collection.save({
                _key: alpha(v),
                value: v + 1,
                group: Math.floor(v / 2) + 1
              })
            ),
          Promise.resolve()
        )
      )
      .then(() => void done())
      .catch(done);
  });
  afterEach(function (done) {
    this.timeout(10000);
    collection
      .drop()
      .then(() => void done())
      .catch(done);
  });
  describe("collection.all", () => {
    it("returns a cursor for all documents in the collection", done => {
      collection
        .all()
        .then(cursor => {
          expect(cursor).to.be.an.instanceof(ArrayCursor);
          expect(cursor.count).to.equal(10);
          return cursor.all();
        })
        .then(arr => {
          expect(arr).to.have.length(10);
          arr.forEach((doc: any) => {
            expect(doc).to.have.keys("_key", "_id", "_rev", "value", "group");
            expect(doc._id).to.equal(`${collection.name}/${doc._key}`);
            expect(doc.group).to.equal(Math.floor((doc.value - 1) / 2) + 1);
          });
          expect(arr.map((d: any) => d.value).sort()).to.eql(
            range(10)
              .map(i => i + 1)
              .sort()
          );
          expect(arr.map((d: any) => d._key).sort()).to.eql(
            range(10)
              .map(alpha)
              .sort()
          );
          done();
        })
        .catch(done);
    });
  });
  describe("collection.any", () => {
    it("returns a random document from the collection", done => {
      collection
        .any()
        .then(doc => {
          expect(doc).to.have.keys("$actorId", "$conflicts", "$objectId", "$objects", "$state", "_key", "_id", "_rev", "value", "group");
          expect(doc._key).to.equal(alpha(doc.value - 1));
          expect(doc._id).to.equal(`${collection.name}/${doc._key}`);
          expect(doc.value).to.be.within(1, 10);
          expect(doc.group).to.equal(Math.floor((doc.value - 1) / 2) + 1);
          done();
        })
        .catch(done);
    });
  });
  describe2x("collection.first", () => {
    it("returns the first document in the collection", done => {
      collection
        .first()
        .then(doc => {
          expect(doc).to.have.keys("_key", "_id", "_rev", "value", "group");
          expect(doc._key).to.equal("a");
          expect(doc._id).to.equal(`${collection.name}/${doc._key}`);
          expect(doc.value).to.equal(1);
          expect(doc.group).to.equal(1);
          done();
        })
        .catch(done);
    });
  });
  describe2x("collection.last", () => {
    it("returns the last document in the collection", done => {
      collection
        .last()
        .then(doc => {
          expect(doc).to.have.keys("_key", "_id", "_rev", "value", "group");
          expect(doc._key).to.equal(alpha(9));
          expect(doc._id).to.equal(`${collection.name}/${doc._key}`);
          expect(doc.value).to.equal(10);
          expect(doc.group).to.equal(5);
          done();
        })
        .catch(done);
    });
  });
  describe("collection.byExample", () => {
    it("returns all documents matching the example", done => {
      collection
        .byExample({ group: 2 })
        .then(cursor => {
          expect(cursor).to.be.an.instanceof(ArrayCursor);
          return cursor.all();
        })
        .then(arr => {
          expect(arr).to.have.length(2);
          arr.forEach((doc: any) => {
            expect(doc).to.have.keys("_key", "_id", "_rev", "value", "group");
            expect(doc._id).to.equal(`${collection.name}/${doc._key}`);
            expect(doc.group).to.equal(2);
          });
          expect(arr.map((d: any) => d._key).sort()).to.eql(["c", "d"]);
          expect(arr.map((d: any) => d.value).sort()).to.eql([3, 4]);
          done();
        })
        .catch(done);
    });
  });
  describe("collection.firstExample", () => {
    it("returns the first document matching the example", done => {
      collection
        .firstExample({ group: 2 })
        .then(doc => {
          expect(doc).to.have.keys("_key", "_id", "_rev", "value", "group");
          expect(doc._key).to.match(/^[cd]$/);
          expect(doc._id).to.equal(`${collection.name}/${doc._key}`);
          expect(doc.group).to.equal(2);
          done();
        })
        .catch(done);
    });
  });
  if (C8_VERSION >= 20600) {
    describe2x("collection.lookupByKeys", () => {
      it("returns the documents with the given keys", done => {
        collection
          .lookupByKeys(["b", "c", "d"])
          .then(arr => {
            expect(arr).to.have.length(3);
            arr.forEach((doc: any) => {
              expect(doc).to.have.keys("_key", "_id", "_rev", "value", "group");
              expect(doc._id).to.equal(`${collection.name}/${doc._key}`);
              expect(doc.group).to.equal(Math.floor((doc.value - 1) / 2) + 1);
            });
            expect(arr.map((d: any) => d._key)).to.eql(["b", "c", "d"]);
            done();
          })
          .catch(done);
      });
    });
  }
});
