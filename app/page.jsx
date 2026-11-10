import data from "../data/tracker.json";
import Tracker from "./Tracker";

export default function Page() {
  return <Tracker data={data} />;
}
