const fs = require('fs');
const util = require('util');
const path = require('path');

const _readFile = util.promisify(fs.readFile);

module.exports = {
    import: async connection => {
        try {
            let rawData = await _readFile(path.join(__dirname, '..', 'data', 'indeed.tsv'), 'utf8');
            let rawDataLines = rawData.split('\n');

            let head = true;

            for (var line of rawDataLines) {
                if (head) {
                    head = false;
                } else {
                    let data = extractData(line);
                    if (data) {
                        // Get the company ID. If the company isn't in the table, add it
                        let params = [data.company];
                        let [res, fields] = await connection.query(
                            'SELECT cid FROM cm_company WHERE c_name = ?',
                            params
                        );
                        let cid = null;
                        if (res.length === 0) {
                            [res, fields] = await connection.query(
                                'INSERT INTO cm_company (c_name) VALUES (?)',
                                params
                            );
                            cid = res.insertId;
                        } else {
                            cid = res[0].cid;
                        }

                        // Get the location ID. If the location isn't in the table, add it
                        params = [data.city, data.state];
                        [res, fields] = await connection.query(
                            'SELECT lid FROM cm_location WHERE l_city = ? AND l_state = ?',
                            params
                        );
                        let lid = null;
                        if (res.length === 0) {
                            [res, fields] = await connection.query(
                                'INSERT INTO cm_location (l_city, l_state) VALUES (?,?)',
                                params
                            );
                            lid = res.insertId;
                        } else {
                            lid = res[0].lid;
                        }

                        // Get the profession ID. If the profession isn't in the table, add it
                        params = [data.profession];
                        [res, fields] = await connection.query(
                            'SELECT pid FROM cm_profession WHERE p_name = ?',
                            params
                        );
                        let pid = null;
                        if (res.length === 0) {
                            [res, fields] = await connection.query(
                                'INSERT INTO cm_profession (p_name) VALUES (?)',
                                params
                            );
                            pid = res.insertId;
                        } else {
                            pid = res[0].pid;
                        }

                        // Insert a new entry in the cm_job table
                        params = [data.title, pid, data.salaryMin, data.salaryMax, cid, lid];
                        let sql = 'INSERT INTO cm_job ';
                        sql += '(j_title, j_profession, j_salary_min, j_salary_max, j_company, j_location) ';
                        sql += 'VALUES(?,?,?,?,?,?)';
                        [res, params] = await connection.query(sql, params);
                    }
                }
            }
        } catch (err) {
            throw new Error('Failed to import data: ' + err.message);
        }
    }
};

const hoursWorkedPerYear = 1811;

function extractData(line) {
    let parts = line.split('\t');
    let title = parts[0].toLowerCase();
    let profession = parts[1].toLowerCase();
    let company = parts[2];
    let locationParts = parts[3].split(',');
    // Some of the entries only have the country. We don't want this data, as most of it doesn't have
    // salary data anyways
    if (locationParts.length < 2) {
        return null;
    }
    let city = locationParts[0].trim();
    let stateParts = locationParts[1].trim().split(' ');
    let state = stateParts[0];
    let salaryMin = parts[4] !== '' ? parseInt(parts[4]) : null;
    let salaryMax = parts[5] !== '' ? parseInt(parts[5]) : null;
    // We don't want data that is missing salary information...
    if (salaryMin === null || salaryMax === null) {
        return null;
    }
    if (salaryMin < 100) salaryMin *= hoursWorkedPerYear;
    if (salaryMax < 100) salaryMax *= hoursWorkedPerYear;

    return {
        title,
        profession,
        company,
        city,
        state,
        salaryMin,
        salaryMax
    };
}
