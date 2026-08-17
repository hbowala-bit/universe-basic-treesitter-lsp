SUBROUTINE REGRESSION.CONSTRUCTS
********************************************************************************
* Regression fixture for grammar gaps found by parsing real UniVerse BASIC.
* Every construct below previously produced ERROR nodes. This file must parse
* with zero errors:
*     python tools/parse_report.py examples/regression_constructs.bas --max-error-pct 0
********************************************************************************
$INCLUDE WWINSERT RBO.H
$INCLUDE WWINSERT STD.H

EQU MAX.ROWS TO 100
COMMON /SHARED/ CTX.ARR, CTX.FLAG
DIM WORK.ARR(10)

* --- STATUS as an ordinary variable (was: reserved keyword) -------------------
* Both the glued and spaced assignment forms must parse, and STATUS() must
* still work as a function call.
STATUS=RBO.getProperty("","Action",ACTION)
STATUS=RBO.setProperty("","Score1",SCORE1.LIST)
STATUS = 0
X = STATUS
Y = STATUS()

* --- subscripted assignment with no spaces (was: '>=' ate the closing '>') -----
LOC.ARR<2,POS>=LOC.ARR<2,POS> + OON
PERIOD.ARR<9,POS>=U
SCORE1.LIST<1,-1>="0"
MONTH.ARR<1>="200301":@VM:"200302":@VM:"200303"
NESTED.ARR<1,2,3>=VAL

* --- genuine >= comparison must still parse ------------------------------------
IF TOTAL >= MAXRIDDOR THEN
	MAXRIDDOR = TOTAL
END
IF LOC.ARR<2,POS> >= LIMIT THEN
	FLAG = 1
END

* --- LOOP with head statement and/or terminating condition --------------------
XX = 0
LOOP XX+=1 UNTIL D$SYCTL<1,XX>=""
	LOCATE D$SYCTL<1,XX> IN CL.ARR SETTING POS THEN
	END ELSE
		INS D$SYCTL<1,XX> BEFORE CL.ARR<1,POS>
	END
REPEAT

ZZ = 0
LOOP ZZ+=1 UNTIL SUBSUBLOC1<1,ZZ>="" DO
	ALL.LOCATION.LIST<1,-1>=SUBSUBLOC1<1,ZZ>
REPEAT

LOOP WHILE MORE.DATA DO
	MORE.DATA = 0
REPEAT

LOOP
	READNEXT REF ELSE EXIT
REPEAT

* --- READV with the field-position third argument ------------------------------
READV SUBLOC.DESC FROM F$LOC, SUBLOC, 1 ELSE SUBLOC.DESC = ""
READV SUBSUBLOC1 FROM F$LOC, DLOC<3,SL.II>, 3 THEN
	PY.PAYLOAD = SUBSUBLOC1
END ELSE
	PY.PAYLOAD = ""
END

* --- two-argument READ / WRITE still fine --------------------------------------
READ D$REC FROM F$DATA, REF ELSE D$REC = ""
WRITE D$REC ON F$DATA, REF

* --- other statement forms already supported, kept as guards -------------------
OPEN 'SYCTL' TO F$SYCTL ELSE
	ERROR=1
	GOSUB 9000
	RETURN
END

FOR XX=1 TO NOMONTH
	TOTON=0
NEXT XX

BEGIN CASE
	CASE ERROR=1
		ERRORMSG = "one"
	CASE ERROR=2
		ERRORMSG = "two"
	CASE 1
END CASE

CALL PYCALL("mod","fn",A,B,PY.STATUS,PY.RESULT)
CHAIN "SY.FATAL.ERROR"

RETURN

* --- numeric label followed by ';' and a comment -------------------------------
9000 ;*Error processing Subroutine
	STATUS=RBO.setProperty("","Error",ERROR)
	RETURN

* --- label with no separator, and a plain label --------------------------------
9100 *Plain comment form
	RETURN

9200
	RETURN
