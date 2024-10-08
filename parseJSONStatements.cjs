const fs = require("fs");
const writeXlsxFile = require("write-excel-file/node");

const sourcefilePath = "statements.json";
const destFilePath = ".\\statements.xlsx";
const jsonFile = fs.readFileSync(sourcefilePath);
const jsonObj = JSON.parse(jsonFile);
const pageUnitsScale = 0.0625038430794052; // scaling factor for text box width added to x position
const minRowSpacing = 0.9; // min increase in y position to count as a new table row

// Define custom rouding function to X decimal places
const decRound = (num, decimals) => {
  if (!Number.isInteger(decimals) || decimals < 0) {
    return null;
  }
  let scalar = Math.pow(10, decimals);
  return Math.round(num * scalar) / scalar;
};

const getParentKeybyValue = (obj, val) => {
  if (typeof obj === "object") {
    for (const key in obj) {
      if (obj[key] === val) {
        return key;
      } else {
        const result = getParentKeybyValue(obj[key], val);
        if (result !== null) return obj[key];
      }
    }
  }
  return null;
};

// Define custom function to get key in dict by value
function getKeyByValue(object, value) {
  return Object.keys(object).find((key) => object[key] === value);
}

// Define custom function to get statement period
const getStatementPeriod = (statement) => {
  d = statement.Meta.Metadata["xmp:metadatadate"].substring(0, 10).split("-");
};

// Define where each column starts in PDF statements
const statementColumnsXDict = {
  date: { x: decRound(2.629, 2), col: 1 },
  transactionDetails: { x: decRound(5.906, 2), col: 2 },
  debits: { x: decRound(18.852 + 73.503 * pageUnitsScale, 2), col: 3 },
  credits: { x: decRound(25.511 + 60.498 * pageUnitsScale, 2), col: 3 },
  // balance: { x: decRound(32.258 + 30.501 * pageUnitsScale, 2), col: 5 },
  accountNumber: { x: 19.542, col: 0 },
  // accountNameX: { x: 2.629, col: 1},
};

let transactionData = [];
var row = -1;
var currentStatement = 0;
var maxYonRow = 0;

var statementPeriodTextY = -1;

for (const statement of jsonObj) {
  var statementPeriod = { start: 0, end: 0 };
  console.log(statement.Meta.Metadata["xmp:metadatadate"]);
  for (const page of statement.Pages) {
    for (const textBox of page.Texts) {
      if (textBox.R[0].T.includes(encodeURIComponent("STATEMENT PERIOD"))) {
        statementPeriodTextY = textBox.y;
      } else if (textBox.y === statementPeriodTextY) {
        if (Date.parse(decodeURIComponent(textBox.R[0].T))) {
          let d = new Date(decodeURIComponent(textBox.R[0].T));
          if (statementPeriod.start === 0) {
            statementPeriod.start = d;
          } else {
            statementPeriod.end = d;
            transactionData.push(statementPeriod);
          }
        }
        continue;
      }

      if (textBox.x === statementColumnsXDict.accountNumber.x) {
        transactionData.push(textBox);
      }

      if (
        getParentKeybyValue(
          statementColumnsXDict,
          decRound(
            textBox.x +
              (textBox.x > statementColumnsXDict.transactionDetails.x + 1
                ? textBox.w * pageUnitsScale
                : 0),
            2
          )
        ) &&
        textBox.R[0].TS[2] !== 1 &&
        !("oc" in textBox)
      ) {
        transactionData.push(textBox);
      }
    }
    transactionData.push("ENDPAGE");
    statementPeriodTextY = -1;
  }
}
var transactionTableArray = Array.from({ length: transactionData.length }, () =>
  Array(5).fill(null)
);

var statementPeriod = { start: 0, end: 0 };

transactionData.forEach((transactionItem, i, arr) => {
  var col = 0;
  var colObject = null;
  if (transactionItem === "ENDPAGE") {
    row++;
    maxYonRow = 0;
    return;
  }
  if ("start" in transactionItem && "end" in transactionItem) {
    statementPeriod.start = transactionItem.start;
    statementPeriod.end = transactionItem.end;
    return;
  }
  if (i !== 0 && transactionItem.y - maxYonRow > minRowSpacing) {
    row++;
    maxYonRow = 0;
    transactionTableArray[row][statementColumnsXDict.accountNumber.col] =
      currentStatement;
  }
  if (transactionItem.x === statementColumnsXDict.accountNumber.x) {
    currentStatement = decodeURIComponent(transactionItem.R[0].T);
    return;
  } else {
    colObject = getParentKeybyValue(
      statementColumnsXDict,
      decRound(
        transactionItem.x +
          (transactionItem.x > statementColumnsXDict.transactionDetails.x + 1
            ? transactionItem.w * pageUnitsScale
            : 0),
        2
      )
    );
    col = colObject.col;
    colKey = getKeyByValue(statementColumnsXDict, colObject);
    maxYonRow = Math.max(maxYonRow, transactionItem.y);
  }

  var itemValue = decodeURIComponent(transactionItem.R[0].T).replace(",", "");
  if (colKey === "date" && Date.parse([itemValue, 1900].join(" "))) {
    let d = [itemValue, statementPeriod.end.getFullYear()].join(" ");
    if (d <= statementPeriod.end) {
      itemValue = d;
    } else {
      itemValue = [itemValue, statementPeriod.end.getFullYear()].join(" ");
    }
  } else if (colKey === "debits") {
    itemValue = parseFloat(itemValue) * -1;
  }

  transactionTableArray[row][col] = [transactionTableArray[row][col], itemValue]
    .join(" ")
    .trim();
});

var transactionTableArray = transactionTableArray.filter(
  (row) =>
    row[2] != "Transaction Total" &&
    row[2] != "Transaction Number" &&
    row[2] != "BALANCE BROUGHT FORWARD" &&
    row[2] != "CLOSING BALANCE" &&
    row[2] !== null &&
    row[3] !== null
);

// Write dates into empty cells where there are multiple same day transactions
transactionTableArray.forEach((transaction, i, arr) => {
  if (transaction[1] == null) {
    transaction[1] = arr[i - 1][1];
  }
});

var excelData = [];

const uniqueCol = (arr, col) => {
  let a = [];
  let c = arr.map((v, i) => {
    return v[col];
  });
  c.forEach((num) => {
    if (!a.includes(num)) {
      a.push(num);
    }
  });
  return a;
};

const accountNumbers = uniqueCol(transactionTableArray, 0);

accountNumbers.forEach((account) => {
  let excelSheetArr = transactionTableArray.filter((row) => row[0] === account);
  excelSheetArr.forEach((transaction, i, arr) => {
    transaction[0] = {
      type: String,
      value: transaction[0],
    };
    transaction[1] = {
      type: Date,
      value: new Date(transaction[1]),
      format: "dd-mmm-yy",
    };
    transaction[2] = {
      type: String,
      value: transaction[2],
    };
    transaction[3] = {
      type: Number,
      value: Number.parseFloat(transaction[3]),
      format: "#,##0.00",
    };
  });
  excelSheetArr.splice(0, 0, [
    // { type: String, value: "Account No." },
    { type: String, value: "Date" },
    { type: String, value: "Transaction Details" },
    { type: String, value: "Transaction Amount" },
  ]);
  excelData.push(excelSheetArr);
});

writeXlsxFile(excelData, {
  fontSize: 11,
  fontFamily: "Aptos Narrow (Body)",
  sheets: accountNumbers,
  filePath: destFilePath,
});

// function writeToCSVFile(data, filename, headers = []) {
//   return new Promise((resolve, reject) => {
//     const transform = new Transform({
//       objectMode: true,
//       transform(chunk, encoding, callback) {
//         this.push(`${Object.values(chunk).join(",")}\n`);
//         callback();
//       },
//     });
//     const writeStream = fs.createWriteStream(filename);
//     writeStream.on("finish", resolve);
//     writeStream.on("error", reject);
//     if (headers.length > 0) {
//       writeStream.write(`${headers.join(",")}\n`);
//     }
//     data.forEach((item) => transform.write(item));
//     transform.end();
//     transform.pipe(writeStream);
//   });
// }

// async function exportToCSV(arr) {
//   try {
//     await writeToCSVFile(arr, "statements.csv", [
//       "Account No.",
//       "Date",
//       "Transaction Details",
//       "Transaction Amount",
//     ]);
//     console.log("The CSV file was written successfully.");
//   } catch (e) {
//     console.error("An error occurred while writing the CSV file.", e);
//   }
// }

// exportToCSV(transactionTableArray);
