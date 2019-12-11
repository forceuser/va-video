import test from "tape";
import sinon from "sinon";
import main from "va-video";

test("empty test", t => {
	t.equal(main(), "result");
	t.end();
});
