import process from "process";

const compareFields = [
  "tweet_sentiment1",
  "tweet_sentiment2",
  "tweet_sentiment3",
  "tweet_sentiment4",
  "tweet_sentiment5",
  "tweet_sentiment_impact1",
  "tweet_sentiment_impact2",
  "tweet_sentiment_impact3",
  "tweet_sentiment_impact4",
  "tweet_sentiment_impact5",
  "galaxy_score",
  "alt_rank",
  "correlation_rank",
  "sentiment_relative",
  "social_volume",
  "social_impact_score",
  "market_cap",
  "market_dominance",
];

// simple helper function to convert possible strings to numbers
function number(num) {
  if (typeof num !== "number") {
    return (((num || "") + "").replace(/[^0-9.-]/gi, "") || 0) * 1;
  } else {
    return num;
  }
}

// basic functionality of converting social movement most recent 24 hours to previous 24 hours into a 1.5 score
function score_from_social_movement(ts, key) {
  let sum_previous = 0;
  let sum_current = 0;
  let most_recent_24 = ts.length - 25; // include most recent hour
  let most_recent_48 = ts.length - 49; // exclude most recent hour
  ts.forEach((tsRow, i) => {
    if (i >= most_recent_48 && i < most_recent_24) {
      sum_previous += number(tsRow[key]);
    } else if (i >= most_recent_24) {
      sum_current += number(tsRow[key]);
    }
  });
  let percent_change = sum_current / sum_previous;
  console.log(
    key,
    "percent_change",
    percent_change,
    "previous",
    sum_previous,
    "current",
    sum_current,
    "diff",
    sum_current - sum_previous
  );
  if (percent_change < 0) {
    percent_change = 0;
  } else if (percent_change > 2) {
    percent_change = 2;
  }
  return 1 + parseFloat(((percent_change / 2) * 4).toFixed(1));
}

// simple averaging helper function
const average = (data) =>
  data.reduce((sum, value) => sum + value) / data.length;

// basic functionality of correlating social movement with price movement into a 1-5 score
function get_correlation_rank(arr1, arr2) {
  const avg1 = average(arr1);
  const avg2 = average(arr2);
  const sumOfProductOfDifferences = arr1
    .map((val, idx) => (val - avg1) * (arr2[idx] - avg2))
    .reduce((a, b) => a + b, 0);
  const sqrtOfSumOfSquaredDifferences1 = Math.sqrt(
    arr1.map((val) => Math.pow(val - avg1, 2)).reduce((a, b) => a + b, 0)
  );
  const sqrtOfSumOfSquaredDifferences2 = Math.sqrt(
    arr2.map((val) => Math.pow(val - avg2, 2)).reduce((a, b) => a + b, 0)
  );
  let correlation =
    sumOfProductOfDifferences /
    (sqrtOfSumOfSquaredDifferences1 * sqrtOfSumOfSquaredDifferences2);
  return 1 + parseFloat((((correlation + 1) / 2) * 4).toFixed(1)); // Scaling to 1-5
}

async function v3_request(output) {
  const res = await fetch(`https://lunarcrush.com/api3/coins/1/time-series`, {
    headers: {
      Authorization: `Bearer ${process.env.LUNAR_API}`,
    },
  }).then((res) => res.json());
  // Take the last few items ignoring the most recent incomplete hour

  res.timeSeries
    .slice(res.timeSeries.length - 4, res.timeSeries.length - 1)
    .forEach((item) => {
      compareFields.forEach((key) => {
        output[key].push(item[key]);
      });
    });

  //console.log("res", res);
  return output;
}

async function v4_request(output) {
  const list = await fetch(`https://lunarcrush.com/api4/public/coins/list/v2`, {
    headers: {
      Authorization: `Bearer ${process.env.LUNAR_API}`,
    },
  }).then((res) => res.json());

  const coin = list.data.find((item) => item.symbol === "BTC" || item.id === 1);
  const topic = coin.topic;
  const topicData = await fetch(
    `https://lunarcrush.com/api4/public/topic/${topic}/v1`,
    {
      headers: {
        Authorization: `Bearer ${process.env.LUNAR_API}`,
      },
    }
  ).then((res) => res.json());
  // console.log("coin", coin);
  // console.log("topicData", topicData);

  // neutral blank/empty data topics
  if (!topicData.data?.num_posts) {
    topicData.data = {
      num_posts: 3,
      types_count: {
        tweet: 3,
      },
      types_interactions: {
        tweet: 3,
      },
      types_sentiment_detail: {
        tweet: {
          positive: 1,
          neutral: 1,
          negative: 1,
        },
      },
    };
  }

  // helper variables to infer the % of posts and interactions on twitter only
  const percent_twitter =
    (topicData.data.types_count.tweet || 1) / topicData.data.num_posts;
  const posts_per_interactions =
    topicData.data.types_count.tweet / topicData.data.types_interactions.tweet;
  const sum_sentiment_tweets =
    topicData.data.types_sentiment_detail.tweet.positive +
    topicData.data.types_sentiment_detail.tweet.neutral +
    topicData.data.types_sentiment_detail.tweet.negative;
  const percent_positive =
    topicData.data.types_sentiment_detail.tweet.positive /
      sum_sentiment_tweets || 0;
  const percent_neutral =
    topicData.data.types_sentiment_detail.tweet.neutral /
      sum_sentiment_tweets || 0;
  const percent_negative =
    topicData.data.types_sentiment_detail.tweet.negative /
      sum_sentiment_tweets || 0;

  const res = await fetch(
    `https://lunarcrush.com/api4/public/coins/1/time-series/v2`,
    {
      headers: {
        Authorization: `Bearer ${process.env.LUNAR_API}`,
      },
    }
  ).then((res) => res.json());
  // Take the last few items ignoring the most recent incomplete hour

  res.data
    .slice(res.data.length - 4, res.data.length - 1)
    .forEach((item, i) => {
      // to mimic tweet_sentiment1-5 we know the percent of tweets that are positive, negative, an neutral
      // the time series data will show how many posts were created and we know what % of posts are twitter.
      // we will split the negative into sentiment 1 and 2 and the same for positive as 4 and 5
      console.log("item", item);
      const use_num_posts = item.posts_active; // you can also use item.posts_created for only posts created that hour, but it is much smaller
      item.tweet_sentiment1 = Math.round(
        use_num_posts * percent_twitter * (percent_negative * 0.5)
      );
      item.tweet_sentiment2 = Math.round(
        use_num_posts * percent_twitter * (percent_negative * 0.5)
      );
      item.tweet_sentiment3 = Math.round(
        use_num_posts * percent_twitter * percent_neutral
      );
      item.tweet_sentiment4 = Math.round(
        use_num_posts * percent_twitter * (percent_positive * 0.5)
      );
      item.tweet_sentiment5 = Math.round(
        use_num_posts * percent_twitter * (percent_positive * 0.5)
      );

      item.tweet_sentiment_impact1 = Math.round(
        item.interactions * percent_twitter * (percent_negative * 0.5)
      );
      item.tweet_sentiment_impact2 = Math.round(
        item.interactions * percent_twitter * (percent_negative * 0.5)
      );
      item.tweet_sentiment_impact3 = Math.round(
        item.interactions * percent_twitter * percent_neutral
      );
      item.tweet_sentiment_impact4 = Math.round(
        item.interactions * percent_twitter * (percent_positive * 0.5)
      );
      item.tweet_sentiment_impact5 = Math.round(
        item.interactions * percent_twitter * (percent_positive * 0.5)
      );

      item.sentiment_relative = item.sentiment;
      item.social_volume = item.posts_active;
      item.social_impact_score = score_from_social_movement(
        res.data.slice(res.data.length - i - 49, res.data.length - i),
        "interactions"
      );
      item.correlation_rank = get_correlation_rank(
        res.data
          .slice(res.data.length - i - 24, res.data.length - i)
          .map((r) => r.close),
        res.data
          .slice(res.data.length - i - 24, res.data.length - i)
          .map((r) => r.interactions)
      );

      compareFields.forEach((key) => {
        output[key].push(item[key]);
      });
    });

  console.log({
    percent_twitter,
    posts_per_interactions,
    sum_sentiment_tweets,
    percent_positive,
    percent_neutral,
    percent_negative,
  });
  //console.log("res", res);
  return output;
}

async function main() {
  if (!process.env.LUNAR_API) {
    throw new Error(
      `Specify your API key using the command: LUNAR_API="YOUR_API_KEY" node index.mjs`
    );
  }
  const output = {};
  compareFields.forEach((key) => {
    output[key] = [];
  });

  console.log("getting v3 time series");
  await v3_request(output);
  console.log("getting v4 time series");
  await v4_request(output);

  console.table(output);
}

main();
